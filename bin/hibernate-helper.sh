#!/bin/bash
# hibernado Helper Script
# This script sets up hibernation without unlocking the filesystem
# Based on: https://github.com/nazar256/publications/blob/main/guides/steam-deck-hibernation.md

set -e

# Log function for better debugging
log() {
    echo "[hibernado] $1" >&2
}

ACTION="${1:-status}"

case "$ACTION" in
    status)
        # Check hibernation status
        SWAP="/home/swapfile"
        
        # Check swapfile exists
        if [ ! -f "$SWAP" ]; then
            echo "SWAPFILE_MISSING"
            exit 0
        fi
        
        # Check swapfile has reasonable size (at least total RAM in bytes)
        # We create RAM+1GB, so minimum should be at least RAM size
        SWAP_SIZE=$(stat -c "%s" "$SWAP" 2>/dev/null || echo 0)
        TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        MIN_SIZE=$((TOTAL_RAM_KB * 1024))  # Convert KB to bytes
        if [ "$SWAP_SIZE" -lt "$MIN_SIZE" ]; then
            echo "SWAPFILE_TOO_SMALL"
            exit 0
        fi
        
        # Check swap is active
        if ! swapon --show=NAME | grep -q "$SWAP"; then
            echo "SWAP_INACTIVE"
            exit 0
        fi
        
        # Check resume parameters in GRUB config. Be flexible: accept either
        # our /etc/default/grub.d/hibernado.cfg or the main /etc/default/grub.
        if ([ -f /etc/default/grub.d/hibernado.cfg ] && grep -q "resume=" /etc/default/grub.d/hibernado.cfg 2>/dev/null) || \
           ([ -f /etc/default/grub ] && grep -q "resume=" /etc/default/grub 2>/dev/null); then
            # resume parameter found
            :
        else
            echo "RESUME_NOT_CONFIGURED"
            exit 0
        fi
        
        # Check if systemd bypass is configured
        if ! systemctl cat systemd-logind.service 2>/dev/null | grep -q "SYSTEMD_BYPASS_HIBERNATION_MEMORY_CHECK"; then
            echo "SYSTEMD_NOT_CONFIGURED"
            exit 0
        fi
        
        # Check if bluetooth fix service exists
        if [ ! -f /etc/systemd/system/fix-bluetooth-resume.service ]; then
            echo "BLUETOOTH_FIX_MISSING"
            exit 0
        fi
        
        # Check if sleep.conf is configured
        if [ ! -f /etc/systemd/sleep.conf ] || ! grep -q "HibernateDelaySec" /etc/systemd/sleep.conf 2>/dev/null; then
            echo "SLEEP_CONF_NOT_CONFIGURED"
            exit 0
        fi
        
        echo "READY"
        ;;
        
    prepare)
        # Prepare hibernation setup WITHOUT unlocking filesystem
        log "Starting hibernation preparation..."
        
        # Get UUID of /home filesystem (not the swapfile itself)
        UUID=$(findmnt -no UUID -T /home)
        if [ -z "$UUID" ]; then
            log "ERROR: Could not find UUID for /home"
            echo "ERROR: Could not determine filesystem UUID for /home" >&2
            exit 1
        fi
        log "Found filesystem UUID: $UUID"
        
        SWAP=/home/swapfile
        
        log "Setting up hibernation (filesystem-friendly method)..."
        
        # 1. Ensure swapfile exists and is large enough (20GB recommended)
        if ! swapon --show=NAME | grep -q "$SWAP"; then
            # Check if swapfile exists but needs to be recreated
            if [ -f "$SWAP" ]; then
                SWAP_SIZE=$(stat -c "%s" "$SWAP" 2>/dev/null || echo 0)
                MIN_SIZE=$((16 * 1024 * 1024 * 1024))  # 16GB in bytes
                
                # Check if swapfile is valid by trying to read its header
                if ! file "$SWAP" | grep -q "swap file" || [ "$SWAP_SIZE" -lt "$MIN_SIZE" ]; then
                    log "Existing swapfile is invalid or too small, removing and recreating..."
                    rm -f "$SWAP"
                fi
            fi
            
            if [ ! -f "$SWAP" ]; then
                # Calculate swap size: Total RAM + 1GB (same as main branch)
                # This ensures enough space for hibernation image plus overhead
                SWAP_SIZE_MB=$(( $(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024 + 1024 ))
                log "Creating ${SWAP_SIZE_MB}MB swapfile (RAM + 1GB) using fallocate..."
                
                # Use fallocate like the main branch - it's much faster than dd
                # and works well on SteamOS/Steam Deck
                if ! fallocate -l ${SWAP_SIZE_MB}M "$SWAP" 2>&1; then
                    log "ERROR: Failed to create swapfile with fallocate"
                    echo "ERROR: Failed to create swapfile" >&2
                    exit 1
                fi
                log "Swapfile created successfully"
                
                log "Setting swapfile permissions..."
                chmod 600 "$SWAP"
                
                log "Formatting swapfile..."
                if ! mkswap "$SWAP" >/dev/null 2>&1; then
                    log "ERROR: Failed to format swapfile"
                    echo "ERROR: Failed to format swapfile" >&2
                    exit 1
                fi
                log "Swapfile formatted successfully"
            else
                # Existing swapfile looks good, just fix permissions if needed
                log "Found existing swapfile, checking permissions..."
                chmod 600 "$SWAP"
            fi
            
            log "Activating swapfile..."
            if ! swapon "$SWAP" 2>&1; then
                log "ERROR: Failed to activate swapfile"
                echo "ERROR: Failed to activate swapfile" >&2
                exit 1
            fi
        else
            log "Swapfile already active"
        fi
        
        # Optionally defragment swapfile for better performance
        log "Checking swapfile fragmentation..."
        e4defrag "$SWAP" 2>/dev/null || log "Defrag not needed or not supported"
        
        # Get file offset
        log "Getting swapfile offset..."
        OFF=$(filefrag -v "$SWAP" | awk '$1=="0:" {print substr($4, 1, length($4)-2)}')
        if [ -z "$OFF" ]; then
            log "ERROR: Could not determine swapfile offset"
            echo "ERROR: Could not determine swapfile offset" >&2
            exit 1
        fi
        
        log "Swapfile UUID: $UUID"
        log "Swapfile offset: $OFF"
        
        # 2. Update GRUB config (persists across updates better than kernel cmdline)
        if [ ! -f /etc/default/grub.d/hibernado.cfg ]; then
            log "Configuring GRUB for hibernation resume..."
            mkdir -p /etc/default/grub.d
            cat > /etc/default/grub.d/hibernado.cfg << EOF
# hibernado plugin - hibernation resume parameters
# This file adds resume parameters to GRUB_CMDLINE_LINUX_DEFAULT
GRUB_CMDLINE_LINUX_DEFAULT="\$GRUB_CMDLINE_LINUX_DEFAULT resume=/dev/disk/by-uuid/$UUID resume_offset=$OFF"
EOF
            if ! update-grub 2>&1; then
                log "WARNING: update-grub failed, may need manual run"
                echo "NOTE: Please run 'sudo update-grub' manually" >&2
            fi
        else
            log "GRUB config already exists"
        fi
        
        # 3. Configure systemd-logind to bypass hibernation memory check
        log "Configuring systemd-logind..."
        mkdir -p /etc/systemd/system/systemd-logind.service.d
        cat > /etc/systemd/system/systemd-logind.service.d/hibernado-override.conf << EOF
[Service]
Environment=SYSTEMD_BYPASS_HIBERNATION_MEMORY_CHECK=1
EOF
        systemctl daemon-reload
        
        # 4. Create Bluetooth fix script
        log "Setting up Bluetooth fix for resume..."
        mkdir -p /home/deck/.local/bin
        cat > /home/deck/.local/bin/fix-bluetooth.sh << 'EOF'
#!/bin/bash
PATH=/sbin:/usr/sbin:/bin:/usr/bin

is_bluetooth_ok() {
    echo "Checking Bluetooth status..."
    bluetoothctl discoverable on
    if [ $? -ne 0 ]; then
        echo "Bluetooth is misbehaving."
        return 1  # Bluetooth needs fixing
    else
        echo "Bluetooth is working fine."
        return 0  # Bluetooth is OK
    fi
}

sleep 2 # make sure system woke up completely

if ! is_bluetooth_ok; then
    # if bluetooth problem detected, reinitialize the driver
    (echo serial0-0 > /sys/bus/serial/drivers/hci_uart_qca/unbind ; sleep 1 && echo serial0-0 > /sys/bus/serial/drivers/hci_uart_qca/bind)
fi
EOF
        chmod +x /home/deck/.local/bin/fix-bluetooth.sh
        chown deck:deck /home/deck/.local/bin/fix-bluetooth.sh
        
        # 5. Create systemd service for Bluetooth fix
        log "Creating Bluetooth fix systemd service..."
        cat > /etc/systemd/system/fix-bluetooth-resume.service << EOF
[Unit]
Description=Fix Bluetooth after resume from hibernation
After=hibernate.target hybrid-sleep.target suspend-then-hibernate.target bluetooth.service

[Service]
Type=oneshot
ExecStart=/home/deck/.local/bin/fix-bluetooth.sh

[Install]
WantedBy=hibernate.target hybrid-sleep.target suspend-then-hibernate.target
EOF
        systemctl daemon-reload
        systemctl enable fix-bluetooth-resume.service
        
        # 6. Configure sleep.conf for suspend-then-hibernate (60 min default)
        log "Configuring suspend-then-hibernate timing..."
        cat > /etc/systemd/sleep.conf << EOF
# hibernado plugin - suspend-then-hibernate configuration
[Sleep]
AllowSuspend=yes
AllowHibernation=yes
AllowSuspendThenHibernate=yes
HibernateDelaySec=60min
EOF
        # Reload systemd to apply sleep.conf changes
        systemctl daemon-reload
        
        log "Hibernation setup complete!"
        echo "SUCCESS:$UUID:$OFF"
        ;;
        
    hibernate)
        # Trigger immediate hibernation
        # Sync filesystems first for safety
        sync
        # Write 'disk' to trigger hibernation
        echo disk > /sys/power/state
        ;;
        
    suspend-then-hibernate)
        # Trigger suspend-then-hibernate
        # This suspends to RAM first, then hibernates after HibernateDelaySec (default 60min)
        systemctl suspend-then-hibernate
        ;;
        
    cleanup)
        # Clean up hibernation setup during plugin uninstall
        SWAP=/home/swapfile
        
        log "Cleaning up hibernation configuration..."
        
        # 1. Remove GRUB config and rebuild
        if [ -f /etc/default/grub.d/hibernado.cfg ]; then
            log "Removing GRUB hibernation config..."
            rm -f /etc/default/grub.d/hibernado.cfg
            # Clean up empty grub.d directory if it exists and is empty
            rmdir /etc/default/grub.d 2>/dev/null || true
            log "Rebuilding GRUB configuration..."
            if ! update-grub 2>&1; then
                log "WARNING: update-grub failed"
                echo "NOTE: Please run 'sudo update-grub' manually" >&2
            else
                log "GRUB configuration updated successfully"
            fi
        fi
        
        # 2. Remove systemd-logind override
        if [ -f /etc/systemd/system/systemd-logind.service.d/hibernado-override.conf ]; then
            log "Removing systemd-logind override..."
            rm -f /etc/systemd/system/systemd-logind.service.d/hibernado-override.conf
            rmdir /etc/systemd/system/systemd-logind.service.d 2>/dev/null || true
        fi
        
        # 3. Disable and remove Bluetooth fix service
        log "Removing Bluetooth fix service..."
        systemctl disable fix-bluetooth-resume.service 2>/dev/null || true
        rm -f /etc/systemd/system/fix-bluetooth-resume.service
        rm -f /home/deck/.local/bin/fix-bluetooth.sh
        # Clean up empty .local/bin directory if it exists and is empty
        rmdir /home/deck/.local/bin 2>/dev/null || true
        
        # 4. Remove sleep.conf
        if [ -f /etc/systemd/sleep.conf ]; then
            log "Removing sleep configuration..."
            rm -f /etc/systemd/sleep.conf
        fi
        
        # 5. Reload systemd to apply all changes
        log "Reloading systemd configuration..."
        systemctl daemon-reload
        
        # 6. Deactivate and remove swapfile
        if swapon --show=NAME | grep -q "$SWAP"; then
            log "Deactivating swapfile..."
            swapoff "$SWAP" 2>&1 || log "WARNING: Failed to deactivate swapfile"
        fi
        
        if [ -f "$SWAP" ]; then
            log "Removing swapfile..."
            rm -f "$SWAP" 2>&1 || log "WARNING: Failed to remove swapfile"
        fi
        
        log "Cleanup complete. All hibernation configuration has been removed."
        log "NOTE: A reboot is recommended to ensure all kernel parameters are reset."
        ;;
        
    *)
        echo "Usage: $0 {status|prepare|hibernate|suspend-then-hibernate|cleanup}"
        exit 1
        ;;
esac
