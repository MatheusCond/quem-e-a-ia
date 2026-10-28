import { Migration } from '@mikro-orm/migrations';

export class Migration20261028033055 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "messages" ("id" uuid not null, "match_id" uuid not null, "seat_id" uuid null, "kind" varchar(10) not null, "text" text not null, "is_ai" boolean not null default false, "is_intervention" boolean not null default false, "broke_character" boolean not null default false, "created_at" timestamptz not null, "visible_at" timestamptz not null, constraint "messages_pkey" primary key ("id"));`);
    this.addSql(`create index "messages_match_id_visible_at_index" on "messages" ("match_id", "visible_at");`);

    this.addSql(`create table "matches" ("id" uuid not null, "room_id" uuid not null, "number" int not null, "phase" varchar(20) not null, "phase_ends_at" timestamptz null, "settings" jsonb not null, "seats" jsonb not null, "ai_count" int not null, "theme" varchar(200) null, "flash" jsonb null, "ai_resting" boolean not null default false, "started_at" timestamptz not null, "conversation_started_at" timestamptz null, "finished_at" timestamptz null, "scores" jsonb null, "audit_key" varchar(200) null, "ranking_applied" boolean not null default false, constraint "matches_pkey" primary key ("id"));`);
    this.addSql(`create index "matches_room_id_started_at_index" on "matches" ("room_id", "started_at");`);
    this.addSql(`create index "matches_phase_index" on "matches" ("phase");`);
    this.addSql(`alter table "matches" add constraint "matches_room_id_number_unique" unique ("room_id", "number");`);

    this.addSql(`create table "players" ("id" uuid not null, "room_id" uuid not null, "nickname" varchar(40) not null, "avatar_key" varchar(120) null, "total_score" int not null default 0, "joined_at" timestamptz not null, constraint "players_pkey" primary key ("id"));`);
    this.addSql(`create index "players_room_id_index" on "players" ("room_id");`);

    this.addSql(`create table "reports" ("id" uuid not null, "match_id" uuid not null, "message_id" uuid not null, "reporter_player_id" uuid not null, "reason" varchar(200) not null, "created_at" timestamptz not null, constraint "reports_pkey" primary key ("id"));`);
    this.addSql(`create index "reports_match_id_index" on "reports" ("match_id");`);

    this.addSql(`create table "rooms" ("id" uuid not null, "code" varchar(8) not null, "host_player_id" uuid null, "settings" jsonb not null, "created_at" timestamptz not null, constraint "rooms_pkey" primary key ("id"));`);
    this.addSql(`alter table "rooms" add constraint "rooms_code_unique" unique ("code");`);
  }

}
