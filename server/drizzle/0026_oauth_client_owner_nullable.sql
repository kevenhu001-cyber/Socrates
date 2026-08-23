-- 0026: RFC 7591 dynamic client registration — dynamically registered
-- clients have no owning account until an operator adopts them.

ALTER TABLE "oauth_clients" ALTER COLUMN "owner_user_id" DROP NOT NULL;
