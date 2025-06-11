#!/bin/sh

##> install
npx vsce package 0.4.3
code --install-extension exrosnippets-0.4.3.vsix
