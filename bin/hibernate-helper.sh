#!/bin/bash
# hibernado Helper Script
# This script runs with proper system environment to avoid library conflicts

set -e

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
        
        # Check swap is active
        if ! swapon --show=NAME | grep -q "$SWAP"; then
            echo "SWAP_INACTIVE"
            exit 0
        fi
        
        # Check resume parameters
        if ! grep -q "resume=" /etc/kernel/cmdline 2>/dev/null; then
            echo "RESUME_NOT_CONFIGURED"
            exit 0
        fi
        
        echo "READY"
        ;;
        
    prepare)
        # Prepare hibernation setup
        UUID=$(findmnt -no UUID -T /)
        SWAP=/home/swapfile
        
        # Create/activate swap
        if ! swapon --show=NAME | grep -q "$SWAP"; then
            if [ ! -f "$SWAP" ]; then
                echo "Creating swapfile..."
                fallocate -l $(( $(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024 + 1024 ))M "$SWAP"
                chmod 600 "$SWAP"
                mkswap "$SWAP" >/dev/null
            fi
            swapon "$SWAP"
        fi
        
        # Get file offset
        OFF=$(filefrag -v "$SWAP" | awk '/^ 0:/{sub(/\.\./,"");print $4}')
        
        # Update kernel parameters
        steamos-readonly disable
        sed -i '/resume=/d' /etc/kernel/cmdline
        echo "resume=UUID=$UUID resume_offset=$OFF" >> /etc/kernel/cmdline
        kernel-install add-current >/dev/null 2>&1
        steamos-readonly enable
        
        echo "SUCCESS:$UUID:$OFF"
        ;;
        
    hibernate)
        # Trigger hibernation by writing directly to the power state file
        # This bypasses systemctl/PolicyKit and works when running as root
        # Sync filesystems first for safety
        sync
        # Write 'disk' to trigger hibernation
        echo disk > /sys/power/state
        ;;
        
    cleanup)
        # Clean up hibernation setup during plugin uninstall
        SWAP=/home/swapfile
        
        echo "Cleaning up hibernation configuration..."
        
        # Unlock filesystem
        steamos-readonly disable
        
        # Remove resume parameters from kernel cmdline
        if [ -f /etc/kernel/cmdline ]; then
            echo "Removing resume parameters from kernel cmdline..."
            sed -i '/resume=/d' /etc/kernel/cmdline
            
            # Rebuild kernel configuration
            echo "Rebuilding kernel configuration..."
            kernel-install add-current >/dev/null 2>&1 || true
        fi
        
        # Deactivate swap if active
        if swapon --show=NAME | grep -q "$SWAP"; then
            echo "Deactivating swap..."
            swapoff "$SWAP" || true
        fi
        
        # Remove swapfile if it exists
        if [ -f "$SWAP" ]; then
            echo "Removing swapfile..."
            rm -f "$SWAP" || true
        fi
        
        # Re-lock filesystem
        steamos-readonly enable
        
        echo "Cleanup complete"
        ;;
        
    *)
        echo "Usage: $0 {status|prepare|hibernate|cleanup}"
        exit 1
        ;;
esac
