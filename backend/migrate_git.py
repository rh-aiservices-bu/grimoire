#!/usr/bin/env python3
"""
Migration script to add git integration tables to the database.
"""

import sqlite3
import sys
import os

def run_migration():
    """Run the migration to add git integration tables"""
    
    # Path to the database
    db_path = "grimoire.db"
    
    if not os.path.exists(db_path):
        print(f"Database file {db_path} not found!")
        sys.exit(1)
    
    try:
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("Starting git integration migration...")
        
        # Add git_repo_url column to projects table
        try:
            cursor.execute("ALTER TABLE projects ADD COLUMN git_repo_url TEXT")
            print("✓ Added git_repo_url column to projects table")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print("✓ git_repo_url column already exists in projects table")
            else:
                raise
        
        # Create users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                git_platform TEXT NOT NULL,
                git_username TEXT NOT NULL,
                git_access_token TEXT NOT NULL,
                created_at DATETIME NOT NULL
            )
        """)
        print("✓ Created users table")
        
        # Create pending_prs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pending_prs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                prompt_history_id INTEGER NOT NULL,
                pr_url TEXT NOT NULL,
                pr_number INTEGER NOT NULL,
                is_merged BOOLEAN NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects (id),
                FOREIGN KEY (prompt_history_id) REFERENCES prompt_history (id)
            )
        """)
        print("✓ Created pending_prs table")
        
        # Commit changes
        conn.commit()
        print("✓ Migration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run_migration()