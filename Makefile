SHELL := /bin/bash
.DEFAULT_GOAL := help

# Paths
WORKER_DIR := backend/cloudflare-worker

.PHONY: help deploy log

help:
	@echo "Targets:"
	@echo "  deploy  Deploy the Cloudflare Worker"
	@echo "  log     Stream logs from the Cloudflare Worker"
	@echo ""
	@echo "Vector store utilities have moved to database/Makefile"
	@echo "  e.g. OPENAI_API_KEY=sk-... make -C database sync"

deploy:
	cd $(WORKER_DIR) && wrangler deploy

log:
	cd $(WORKER_DIR) && npx wrangler tail
