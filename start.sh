#!/bin/bash
export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin
echo "🚀 Starting entire Keli-Sensing Platform..."

echo "🧹 Cleaning up old processes..."
lsof -ti:3001 | xargs kill -9 2>/dev/null

lsof -ti:5174 | xargs kill -9 2>/dev/null

echo "✅ Starting Main Node.js Backend..."
node src/server.js &
NODE_PID=$!


echo "✅ Starting React Frontend UI..."
cd frontend || exit
npm run dev &
VITE_PID=$!
cd ..

echo "--------------------------------------------------------"
echo "🌐 Platform is LIVE!"
echo "   -> Dashboard: http://localhost:5174"
echo "   -> API Server: http://localhost:3001"
echo "--------------------------------------------------------"
echo "🛑 Press Ctrl+C to safely shut down."

trap 'echo "\nShutting down servers..."; kill $NODE_PID $VITE_PID 2>/dev/null; exit' INT TERM
wait
