#!/bin/bash

# Copy files
shopt -s extglob
cp -r !(start.sh) /frontend

# Change workdir
# shellcheck disable=SC2164
cd /frontend

# Log version
echo "----------------------------------------"
echo "Node version"
echo "----------------------------------------"
node --version

# Build next.js
echo "----------------------------------------"
echo "Build next.js"
echo "----------------------------------------"
npm run build

# Start next.js
echo "----------------------------------------"
echo "Start next.js"
echo "----------------------------------------"
exec npm run start
