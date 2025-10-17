# Hibernato

A Decky Loader plugin that enables hibernation functionality on Steam Deck with automated swap configuration and kernel parameter management.

## Overview

Hibernato provides a streamlined interface for hibernating the Steam Deck. The plugin handles all necessary system configuration, including swapfile creation, swap activation, and kernel resume parameter setup. It operates with root privileges to manage system-level operations required for hibernation.

## Features

- **Automated Setup**: Automatically configures hibernation prerequisites on first use
- **Status Monitoring**: Real-time display of hibernation readiness and configuration state
- **Swapfile Management**: Creates and activates swapfile sized appropriately for system memory
- **Kernel Configuration**: Manages resume parameters in `/etc/kernel/cmdline` for proper wake-up
- **Manual Control**: Option to manually trigger setup or use auto-configuration mode
- **State Persistence**: Configuration persists across system updates when properly managed

## Architecture

### Components

- **Frontend** (`src/index.tsx`): React-based UI using Decky Frontend Library
- **Backend** (`main.py`): Python plugin service running with root privileges
- **Helper Script** (`bin/hibernate-helper.sh`): Bash script for system-level operations
- **Plugin Metadata** (`plugin.json`, `package.json`): Configuration and dependency definitions

### Technical Implementation

The plugin operates in three phases:

1. **Status Check**: Validates swapfile existence, swap activation state, and resume configuration
2. **Preparation**: Creates swapfile at `/home/swapfile`, activates swap, calculates file offset, updates kernel parameters
3. **Hibernation**: Syncs filesystems and writes to `/sys/power/state` to trigger suspend-to-disk

Hibernato requires root privileges (`"flags": ["root"]` in `plugin.json`) to perform privileged operations without PolicyKit interaction.

## Installation

### Via Decky Plugin Store

Install directly from the Decky Plugin Store browser within Steam Deck's Gaming Mode.

### Manual Installation

1. Build the plugin:
   ```bash
   pnpm install
   pnpm run build
   ```

2. Package and deploy:
   ```bash
   # Output will be in out/Hibernato.zip
   # Transfer to Steam Deck and extract to:
   # ~/homebrew/plugins/Hibernato/
   ```

3. Restart Decky Loader to load the plugin.

## Development

### Prerequisites

- Node.js v16.14 or later
- pnpm v9
- Docker (for backend builds, if needed)
- Access to Steam Deck or compatible system for testing

### Build Environment Setup

```bash
# Install dependencies
pnpm install

# Build frontend
pnpm run build

# Watch mode for development
pnpm run watch
```

### Project Structure

```
hibernato/
├── src/
│   ├── index.tsx          # Frontend UI implementation
│   └── types.d.ts         # TypeScript definitions
├── main.py                # Backend plugin service
├── bin/
│   └── hibernate-helper.sh # System operation script
├── backend/               # Legacy backend (not currently used)
├── plugin.json            # Plugin metadata
├── package.json           # NPM dependencies
└── rollup.config.js       # Build configuration
```

### Development Workflow

1. Make changes to source files
2. Build with `pnpm run build` or run `build` task in VS Code
3. Deploy using provided tasks or manual transfer
4. Test on target device
5. Monitor logs via `journalctl -f` on Steam Deck

### VS Code Tasks

- `setup`: Install dependencies and configure environment
- `build`: Compile frontend and backend
- `deploy`: Transfer plugin to Steam Deck
- `builddeploy`: Combined build and deployment

## Usage

### First Time Setup

1. Open Hibernato from the Decky menu
2. Check the hibernation status indicator
3. If not ready, click "Setup Hibernation" or enable "Auto-setup" toggle
4. The plugin will configure swapfile and kernel parameters automatically

### Hibernating

1. Ensure "Auto-setup" is enabled (default) or manually run setup
2. Click "Hibernate Now"
3. System will sync filesystems and enter hibernation
4. Resume by pressing the power button

### Status Indicators

- **Green**: Ready for hibernation
- **Orange**: Partial configuration (e.g., swap exists but kernel not configured)
- **Red**: Not configured

## Technical Notes

### Swapfile Location

The swapfile is created at `/home/swapfile` with a size of `RAM + 1GB` to ensure sufficient space for hibernation data.

### Kernel Parameters

Resume parameters are appended to `/etc/kernel/cmdline`:
```
resume=UUID=<root-uuid> resume_offset=<swapfile-offset>
```

After modification, `kernel-install add-current` is executed to regenerate the boot image.

### Read-Only Filesystem

The plugin temporarily disables SteamOS read-only root filesystem protections using `steamos-readonly disable/enable` to modify kernel parameters.

### Permissions

Running as root is required for:
- Creating and activating swapfiles
- Modifying `/etc/kernel/cmdline`
- Running `kernel-install`
- Writing to `/sys/power/state`

## Troubleshooting

### Hibernation Fails

- Verify swapfile exists: `ls -lh /home/swapfile`
- Check swap is active: `swapon --show`
- Validate kernel parameters: `cat /etc/kernel/cmdline`
- Review plugin logs in Decky Developer console

### Setup Fails

- Ensure sufficient disk space for swapfile
- Check filesystem is writable
- Verify root privileges are granted to plugin
- Examine helper script execution in system logs

### Resume Issues

- Confirm resume UUID matches root filesystem
- Verify resume offset matches swapfile physical offset
- Check bootloader configuration loaded updated kernel parameters

## License

BSD-3-Clause
