#!/bin/bash
cd client
npm run build
cd ../server
npm run build

npm run test-server
npm run test-client
