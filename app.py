import os
import sys

# Ensure the project root is on the path so imports work on Vercel
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from website import create_app

app = create_app()

if __name__ == "__main__":
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    app.run(debug=debug_mode)
