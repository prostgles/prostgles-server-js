#!/bin/bash

set -e # Exit immediately if a command exits with a non-zero status

npm run build 

package_directory=../debug/ci-package
mkdir -p "$package_directory"
package_tarball=$(npm pack .. --ignore-scripts --pack-destination "$package_directory" --silent)
rm -rf server/node_modules/prostgles-server
mkdir -p server/node_modules/prostgles-server
tar -xzf "$package_directory/$package_tarball" --strip-components=1 -C server/node_modules/prostgles-server

npm run typecheck

cd client
npm run build
node ../checkProstglesTypes.js
npm run testBasicHooks


cd ../server

npm run build
npm run lint --prefix ../..
npm run test-server && \
TEST_NAME="syncTriggerCleanup" npm run test-client && \
TEST_NAME="main"         npm run test-client && \
TEST_NAME="useProstgles" npm run test-client && \
TEST_NAME="files"        npm run test-client && \
TEST_NAME="rest_api"     npm run test-client

