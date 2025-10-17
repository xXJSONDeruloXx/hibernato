# Hibernado

A Decky Loader plugin that enables hibernation on Steam Deck with automated swap configuration and kernel parameter management.

## Features

- **Hibernate Now**: Direct hibernation - system saves state to disk and powers off
- **Suspend then Hibernate**: Suspend to RAM first, then hibernate after 1 hour delay 

- **Automated Setup**: Automatically configures swapfile and kernel parameters on first use

- **Cleanup on Uninstall**: Automatically removes swapfile and kernel configuration when plugin is uninstalled

## Installation

Install directly from the Decky Plugin Store.

## Usage

1. Open Hibernado from the Decky menu
2. Check the status indicator (green = ready, orange = partial setup, red = not configured) and press setup button if not green.
3. Choose your power option:
   - **Hibernate Now**: Immediately hibernate (faster, no battery drain)
   - **Suspend then Hibernate**: Suspend first, hibernate after delay (quick resume if within delay)
4. If not ready, click "Setup Hibernation" to configure automatically
5. Resume by pressing the power button

The plugin automatically creates a swapfile at `/home/swapfile` and configures kernel resume parameters when needed.

## Development

```bash
# Install dependencies
pnpm install

# Build plugin
just build

# Test on your deck with live journal logs (update deck address in justfile as needed)
just test
```
## License

BSD-3-Clause
