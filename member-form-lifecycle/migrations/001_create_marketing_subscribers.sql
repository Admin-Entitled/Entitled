CREATE TABLE marketing_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  age integer NOT NULL CHECK (age BETWEEN 13 AND 100),
  phone varchar(13) NOT NULL UNIQUE CHECK (phone ~ '^[+]91[6-9][0-9]{9}$'),
  city text NOT NULL CHECK (char_length(city) BETWEEN 1 AND 100),
  preferred_types text[] NOT NULL CHECK (
    cardinality(preferred_types) > 0
    AND preferred_types <@ ARRAY['Polos', 'T-Shirts', 'Shirts', 'Sweatshirts', 'Jackets', 'Lowers']::text[]
  ),
  preferred_brand text NOT NULL CHECK (char_length(preferred_brand) BETWEEN 1 AND 100),
  email varchar(254),
  heard_about_us varchar(200),
  marketing_consent boolean NOT NULL CHECK (marketing_consent IS TRUE),
  consented_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
