# hibernado - Development Commands

default:
    just --list

build:
    .vscode/build.sh

test:
    .vscode/build.sh && scp out/hibernado.zip deck@192.168.0.6:~ && clear && ssh deck@192.168.0.6 'journalctl --follow'