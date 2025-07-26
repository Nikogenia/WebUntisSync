#!/bin/bash

# Copy files
shopt -s extglob
cp -r !(start.sh) /backend

# Change workdir
# shellcheck disable=SC2164
cd /backend

# Log version
echo "----------------------------------------"
echo "Node version"
echo "----------------------------------------"
node --version

# Start node.js
echo "----------------------------------------"
echo "Start node.js"
echo "----------------------------------------"
exec npm run start
