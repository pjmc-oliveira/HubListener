-- create database called hubdata.sqlite3 under src folder
-- ex. sqlite3 hubdata.sqlite3 < schema.sql
CREATE TABLE IF NOT EXISTS Repositories (
    id integer PRIMARY KEY,
    owner text NOT NULL,
    name text NOT NULL,
    UNIQUE(owner, name)
);

CREATE TABLE IF NOT EXISTS MetricTypes (
    id integer PRIMARY KEY,
    name text NOT NULL UNIQUE,
    human_name text NOT NULL,  -- can be empty string, but not NULL
    description text NOT NULL  -- can be empty string, but not NULL
);

CREATE TABLE IF NOT EXISTS MetricValues (
    id integer PRIMARY KEY,
    repo_id integer NOT NULL,
    commit_id text NOT NULL,
    commit_date date NOT NULL,
    file_extension text NOT NULL,
    metric_type_id integer NOT NULL,
    metric_value float NOT NULL,
        FOREIGN KEY (repo_id) REFERENCES Repositories(id),
        FOREIGN KEY (metric_type_id) REFERENCES MetricTypes(id)
);