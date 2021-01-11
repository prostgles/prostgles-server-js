#!/bin/bash
cd server
npm run build
npm run test-server
npm run test-client &
cd ../client &&
npm run build
npm test

