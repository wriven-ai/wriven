CREATE INDEX "org_members_user_id_idx" ON "auth_svc"."org_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_uq" ON "auth_svc"."password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "auth_svc"."password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_uq" ON "auth_svc"."refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "auth_svc"."refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "auth_svc"."workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_org_slug_uq" ON "auth_svc"."workspaces" USING btree ("org_id","slug");