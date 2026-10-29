import { Migration } from '@mikro-orm/migrations';

export class Migration20261029030000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "players" add column "chat_name" varchar(40) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "players" drop column "chat_name";`);
  }

}
