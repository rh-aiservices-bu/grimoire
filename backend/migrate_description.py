import sqlite3
import os

def migrate_database():
    db_path = "./grimoire.db"
    
    if not os.path.exists(db_path):
        print("Database does not exist. No migration needed.")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if description column exists in projects table
        cursor.execute("PRAGMA table_info(projects)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'description' not in columns:
            print("Adding 'description' column to projects table...")
            cursor.execute("ALTER TABLE projects ADD COLUMN description TEXT")
            print("✓ Added 'description' column")
        else:
            print("✓ 'description' column already exists")
        
        conn.commit()
        print("Database migration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()