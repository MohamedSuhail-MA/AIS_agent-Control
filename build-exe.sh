#!/bin/bash
set -e

echo "Building Edge Agent source..."
npm run build:agent

echo "Downloading Windows Node.js executable..."
wget -qnc https://nodejs.org/dist/v22.23.2/win-x64/node.exe -O dist/node.exe

echo "Generating SEA (Single Executable Application) Blob..."
node --experimental-sea-config sea-config.json

echo "Copying Node executable..."
cp dist/node.exe dist/ZeroTrustAgent.exe

echo "Injecting Blob into ZeroTrustAgent.exe..."
npx postject dist/ZeroTrustAgent.exe NODE_SEA_BLOB dist/sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA

echo "Removing sig from exe..."
# Note: Windows signatures on node.exe are invalidated by injection
echo "✅ ZeroTrustAgent.exe created in dist/ folder!"
echo "You can now drop this standalone .exe onto any Windows Server. No Node.js installation required."
