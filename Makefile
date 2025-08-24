SHELL := /bin/bash

# Paths
WORKER_DIR := backend/cloudflare-worker
SYNC_SCRIPT := backend/tools/sync-vector-store.mjs

# Environment vars expected:
# - OPENAI_API_KEY: your OpenAI API key
# Optional:
# - VECTOR_STORE_NAME: name of the vector store to create/use (default: jerry-site-knowledge)
# - OPENAI_DELETE_FILES=1: when pruning, also delete detached OpenAI File objects (defaults to not deleting)

.PHONY: help sync-vector-store deploy sync-deploy

help:
	@echo "Targets:"
	@echo "  sync-vector-store  Upload knowledge/ files to OpenAI and set VECTOR_STORE_ID in wrangler.toml"
	@echo "  deploy             Deploy Cloudflare Worker (wrangler deploy)"
	@echo "  sync-deploy        Run sync-vector-store then deploy"
	@echo "  list-vector-store  Show files attached to the configured VECTOR_STORE_ID"
	@echo ""
	@echo "Env vars:"
	@echo "  OPENAI_API_KEY        Required for sync/list commands"
	@echo "  VECTOR_STORE_NAME     Optional, defaults to jerry-site-knowledge"
	@echo "  OPENAI_DELETE_FILES=1 Also delete detached OpenAI File objects during pruning"

sync-vector-store:
	@if [[ -z "$$OPENAI_API_KEY" ]]; then echo "OPENAI_API_KEY is required"; exit 1; fi
	node $(SYNC_SCRIPT)

deploy:
	cd $(WORKER_DIR) && wrangler deploy

sync-deploy: sync-vector-store deploy

list-vector-store:
	@if [[ -z "$$OPENAI_API_KEY" ]]; then echo "OPENAI_API_KEY is required"; exit 1; fi
	node backend/tools/list-vector-store.mjs
