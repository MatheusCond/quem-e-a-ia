import { Migration } from '@mikro-orm/migrations';

export class Migration20261028210000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "stored_objects" ("key" varchar(200) not null, "content_type" varchar(100) not null, "body" bytea not null, "created_at" timestamptz not null, constraint "stored_objects_pkey" primary key ("key"));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "stored_objects" cascade;`);
  }

}
