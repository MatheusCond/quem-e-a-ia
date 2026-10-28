import { Migration } from '@mikro-orm/migrations';

export class Migration20261028034744 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create schema if not exists "worker";`);
    this.addSql(`create table "worker"."daily_usage" ("day" varchar(10) not null, "calls" int not null default 0, "input_tokens" int not null default 0, "output_tokens" int not null default 0, "tripped_at" timestamptz null, constraint "daily_usage_pkey" primary key ("day"));`);

    this.addSql(`create table "worker"."match_stats" ("match_id" uuid not null, "room_code" varchar(8) not null, "provider" varchar(20) null, "ai_count" int not null, "player_count" int not null, "duration_seconds" int not null, "correct_voters" int not null, "total_voters" int not null, "ai_messages" int not null, "human_messages" int not null, "calls" int not null, "input_tokens" int not null, "output_tokens" int not null, "audit_key" varchar(200) null, "finished_at" timestamptz not null, constraint "match_stats_pkey" primary key ("match_id"));`);

    this.addSql(`create table "worker"."match_usage" ("match_id" uuid not null, "provider" varchar(20) not null, "calls" int not null default 0, "own_key_calls" int not null default 0, "input_tokens" int not null default 0, "output_tokens" int not null default 0, "updated_at" timestamptz not null, constraint "match_usage_pkey" primary key ("match_id"));`);
  }

}
