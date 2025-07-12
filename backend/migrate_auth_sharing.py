import sqlite3
import os
from datetime import datetime, timezone

def migrate_auth_sharing():
    """Migration script to add user authentication and project sharing features"""
    db_path = "./grimoire.db"
    
    if not os.path.exists(db_path):
        print("Database does not exist. Creating new database with all tables...")
        # If database doesn't exist, SQLAlchemy will create it with all tables
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Starting authentication and sharing migration...")
        
        # Check if app_users table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='app_users'")
        if not cursor.fetchone():
            print("Creating app_users table...")
            cursor.execute("""
                CREATE TABLE app_users (
                    id INTEGER PRIMARY KEY,
                    email VARCHAR UNIQUE NOT NULL,
                    name VARCHAR NOT NULL,
                    password_hash VARCHAR NOT NULL,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX ix_app_users_id ON app_users (id)")
            cursor.execute("CREATE INDEX ix_app_users_email ON app_users (email)")
            print("✓ Created app_users table")
        else:
            print("✓ app_users table already exists")
        
        # Check if user_sessions table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_sessions'")
        if not cursor.fetchone():
            print("Creating user_sessions table...")
            cursor.execute("""
                CREATE TABLE user_sessions (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    session_token VARCHAR UNIQUE NOT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES app_users (id)
                )
            """)
            cursor.execute("CREATE INDEX ix_user_sessions_id ON user_sessions (id)")
            cursor.execute("CREATE INDEX ix_user_sessions_session_token ON user_sessions (session_token)")
            print("✓ Created user_sessions table")
        else:
            print("✓ user_sessions table already exists")
        
        # Check if project_collaborators table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='project_collaborators'")
        if not cursor.fetchone():
            print("Creating project_collaborators table...")
            cursor.execute("""
                CREATE TABLE project_collaborators (
                    id INTEGER PRIMARY KEY,
                    project_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    role VARCHAR NOT NULL DEFAULT 'viewer',
                    invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects (id),
                    FOREIGN KEY (user_id) REFERENCES app_users (id),
                    UNIQUE (project_id, user_id)
                )
            """)
            cursor.execute("CREATE INDEX ix_project_collaborators_id ON project_collaborators (id)")
            print("✓ Created project_collaborators table")
        else:
            print("✓ project_collaborators table already exists")
        
        # Check if owner_id column exists in projects table
        cursor.execute("PRAGMA table_info(projects)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'owner_id' not in columns:
            print("Adding owner_id column to projects table...")
            cursor.execute("ALTER TABLE projects ADD COLUMN owner_id INTEGER REFERENCES app_users(id)")
            print("✓ Added owner_id column to projects table")
        else:
            print("✓ owner_id column already exists in projects table")
        
        conn.commit()
        print("\n🎉 Authentication and sharing migration completed successfully!")
        print("\nNew features available:")
        print("- User registration and login")
        print("- Project ownership and sharing")
        print("- Role-based access control (owner, editor, viewer)")
        print("- Session-based authentication")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

def verify_migration():
    """Verify that the migration was successful"""
    db_path = "./grimoire.db"
    
    if not os.path.exists(db_path):
        print("❌ Database does not exist")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check all required tables exist
        required_tables = ['app_users', 'user_sessions', 'project_collaborators']
        
        for table in required_tables:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
            if not cursor.fetchone():
                print(f"❌ Table {table} not found")
                return False
        
        # Check owner_id column in projects
        cursor.execute("PRAGMA table_info(projects)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'owner_id' not in columns:
            print("❌ owner_id column not found in projects table")
            return False
        
        print("✅ Migration verification successful!")
        return True
        
    except Exception as e:
        print(f"❌ Verification failed: {e}")
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    print("🚀 Running authentication and sharing migration...")
    migrate_auth_sharing()
    
    print("\n🔍 Verifying migration...")
    if verify_migration():
        print("\n✅ Ready to use authentication and sharing features!")
        print("\nNext steps:")
        print("1. Start the backend server")
        print("2. Register users via /api/auth/register")
        print("3. Create projects with ownership")
        print("4. Share projects with collaborators")
    else:
        print("\n❌ Migration verification failed. Please check the errors above.")