//! TUI components using ratatui
//!
//! Provides an interactive terminal interface for wallet management.

use anyhow::Result;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Terminal,
};
use std::io;

/// App state for the TUI
struct App {
    selected_chain: usize,
    chains: Vec<String>,
    should_quit: bool,
}

impl App {
    fn new() -> Self {
        Self {
            selected_chain: 0,
            chains: vec![
                "Cardano (ADA)".to_string(),
                "Bitcoin (BTC) - Coming Soon".to_string(),
                "Solana (SOL) - Coming Soon".to_string(),
            ],
            should_quit: false,
        }
    }

    fn next_chain(&mut self) {
        self.selected_chain = (self.selected_chain + 1) % self.chains.len();
    }

    fn previous_chain(&mut self) {
        if self.selected_chain > 0 {
            self.selected_chain -= 1;
        } else {
            self.selected_chain = self.chains.len() - 1;
        }
    }
}

/// Run the TUI application
pub fn run() -> Result<()> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create app state
    let mut app = App::new();

    // Main loop
    let result = run_app(&mut terminal, &mut app);

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    result
}

fn run_app(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>, app: &mut App) -> Result<()> {
    loop {
        terminal.draw(|f| {
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .margin(2)
                .constraints([
                    Constraint::Length(3),
                    Constraint::Min(10),
                    Constraint::Length(3),
                ])
                .split(f.area());

            // Header
            let header = Paragraph::new(Line::from(vec![
                Span::styled("begin", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                Span::raw(" - Multi-Chain Wallet"),
            ]))
            .block(Block::default().borders(Borders::ALL));
            f.render_widget(header, chunks[0]);

            // Chain list
            let items: Vec<ListItem> = app
                .chains
                .iter()
                .enumerate()
                .map(|(i, chain)| {
                    let style = if i == app.selected_chain {
                        Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
                    } else {
                        Style::default()
                    };
                    let prefix = if i == app.selected_chain { "► " } else { "  " };
                    ListItem::new(format!("{}{}", prefix, chain)).style(style)
                })
                .collect();

            let list = List::new(items)
                .block(Block::default().borders(Borders::ALL).title("Chains"));
            f.render_widget(list, chunks[1]);

            // Footer
            let footer = Paragraph::new("↑↓ Navigate | Enter: Select | q: Quit")
                .style(Style::default().fg(Color::DarkGray))
                .block(Block::default().borders(Borders::ALL));
            f.render_widget(footer, chunks[2]);
        })?;

        // Handle input
        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('q') => {
                            app.should_quit = true;
                        }
                        KeyCode::Up | KeyCode::Char('k') => {
                            app.previous_chain();
                        }
                        KeyCode::Down | KeyCode::Char('j') => {
                            app.next_chain();
                        }
                        KeyCode::Enter => {
                            // TODO: Show chain details/actions
                        }
                        _ => {}
                    }
                }
            }
        }

        if app.should_quit {
            return Ok(());
        }
    }
}
