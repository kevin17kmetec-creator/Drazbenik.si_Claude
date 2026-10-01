#!/bin/bash
sed -i 's/              auctions={auctions}\n          \/>\n        {activeLegal && (/              auctions={auctions}\n          \/>\n        )}\n        {activeLegal && (/g' src/App.tsx
