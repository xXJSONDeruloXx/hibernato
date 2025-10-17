# Hibernato - Development Commands

# List available commands
default:
    @just --list

build:
    .vscode/build.sh

test:
    .vscode/build.sh && scp out/Hibernato.zip deck@192.168.0.6:~ && clear && ssh deck@192.168.0.6 'journalctl --follow'