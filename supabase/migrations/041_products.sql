-- ============================================================
-- 041_products.sql — Products (Produtos)
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_account ON products(account_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_select ON products;
CREATE POLICY products_select ON products FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS products_insert ON products;
CREATE POLICY products_insert ON products FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS products_update ON products;
CREATE POLICY products_update ON products FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS products_delete ON products;
CREATE POLICY products_delete ON products FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON products;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
