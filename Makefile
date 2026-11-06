# Registry reads go through the swamp CLI (Deno.Command), which swamp flags.
ACCEPTED_WARNINGS = deno-command

include puddle.mk

.PHONY: test
test: ## Run every extension test
	$(DENO) test --allow-read extensions/models/
