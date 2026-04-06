#!/bin/bash
# Simulated multi-model comparison demo for README GIF

BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
MAGENTA="\033[35m"
BLUE="\033[34m"
RESET="\033[0m"
WHITE="\033[97m"

clear

# Title
echo ""
printf "${BOLD}${CYAN}  mcp-multi-model${RESET}${DIM} — Multi-model AI queries for Claude Code${RESET}\n"
echo ""
sleep 1.5

# Show prompt
printf "${DIM}  You:${RESET} ${WHITE}Compare how each model would implement a rate limiter in Go${RESET}\n"
printf "${DIM}  Tool: ${YELLOW}ask_all${RESET}\n"
echo ""
sleep 1

# Spinner simulation
printf "  ⏳ Querying 3 models in parallel..."
sleep 1.5
printf "\r  ✅ All 3 models responded              \n"
echo ""
sleep 0.5

# DeepSeek response
printf "  ${BOLD}${GREEN}━━━ DeepSeek ━━━${RESET}${DIM}  1.3s · 342 tokens · \$0.0001${RESET}\n"
sleep 0.3
printf "  ${WHITE}Use a token bucket algorithm with sync.Mutex:${RESET}\n"
sleep 0.1
printf "  ${DIM}type RateLimiter struct {${RESET}\n"
sleep 0.05
printf "  ${DIM}    mu       sync.Mutex${RESET}\n"
sleep 0.05
printf "  ${DIM}    tokens   float64${RESET}\n"
sleep 0.05
printf "  ${DIM}    maxRate  float64${RESET}\n"
sleep 0.05
printf "  ${DIM}    lastTime time.Time${RESET}\n"
sleep 0.05
printf "  ${DIM}}${RESET}\n"
sleep 0.1
printf "  ${WHITE}Refill tokens on each Allow() call based on elapsed time.${RESET}\n"
printf "  ${WHITE}Simple, efficient, no goroutine overhead.${RESET}\n"
echo ""
sleep 0.8

# Gemini response
printf "  ${BOLD}${BLUE}━━━ Gemini ━━━${RESET}${DIM}  0.9s · 518 tokens · \$0.0003${RESET}\n"
sleep 0.3
printf "  ${WHITE}I'd recommend the sliding window approach for production:${RESET}\n"
sleep 0.1
printf "  ${WHITE}1. ${BOLD}Token Bucket${RESET}${WHITE} — simple, good for bursty traffic${RESET}\n"
sleep 0.05
printf "  ${WHITE}2. ${BOLD}Sliding Window${RESET}${WHITE} — more accurate rate tracking${RESET}\n"
sleep 0.05
printf "  ${WHITE}3. ${BOLD}Leaky Bucket${RESET}${WHITE} — smooths output rate${RESET}\n"
sleep 0.1
printf "  ${WHITE}For Go specifically, use golang.org/x/time/rate which${RESET}\n"
printf "  ${WHITE}implements a token bucket with reservation support.${RESET}\n"
echo ""
sleep 0.8

# Kimi response
printf "  ${BOLD}${MAGENTA}━━━ Kimi ━━━${RESET}${DIM}  2.4s · 287 tokens · \$0.0001${RESET}\n"
sleep 0.3
printf "  ${WHITE}Go's stdlib approach with x/time/rate:${RESET}\n"
sleep 0.1
printf "  ${DIM}limiter := rate.NewLimiter(rate.Every(time.Second), 10)${RESET}\n"
sleep 0.05
printf "  ${DIM}if !limiter.Allow() {${RESET}\n"
sleep 0.05
printf "  ${DIM}    http.Error(w, \"rate limited\", 429)${RESET}\n"
sleep 0.05
printf "  ${DIM}    return${RESET}\n"
sleep 0.05
printf "  ${DIM}}${RESET}\n"
sleep 0.1
printf "  ${WHITE}For distributed systems, use Redis + Lua script for${RESET}\n"
printf "  ${WHITE}atomic sliding window counting across instances.${RESET}\n"
echo ""
sleep 1

# Summary
printf "  ${BOLD}${CYAN}━━━ Summary ━━━${RESET}\n"
sleep 0.3
printf "  ${WHITE}Total cost: ${GREEN}\$0.0005${RESET}  ${DIM}|${RESET}  ${WHITE}Total time: ${GREEN}2.4s${RESET}${DIM} (parallel)${RESET}\n"
printf "  ${WHITE}DeepSeek → implementation detail, Gemini → broad comparison,${RESET}\n"
printf "  ${WHITE}Kimi → practical stdlib + distributed solution${RESET}\n"
echo ""
sleep 3
