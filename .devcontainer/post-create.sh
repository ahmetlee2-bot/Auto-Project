#!/usr/bin/env bash
set -euo pipefail

cd frontend
npm ci

cd ../backend
python -m pip install --upgrade pip
pip install -r requirements.txt -r requirements-dev.txt
