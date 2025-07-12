#!/usr/bin/env python3
"""
Migration to add git_server_url column to users table
"""

import sqlite3
import os

def migrate_add_git_server_url():
    db_path = "./grimoire.db"
    
    if not os.path.exists(db_path):
        print("Database does not exist. No migration needed.")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if git_server_url column exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'git_server_url' not in columns:
            print("Adding 'git_server_url' column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN git_server_url TEXT")
            print("✓ Added 'git_server_url' column")
        else:
            print("✓ 'git_server_url' column already exists")
        
        conn.commit()
        print("Git server URL migration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_add_git_server_url()