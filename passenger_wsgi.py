import sys
import os

# Add your app directory to the system path
sys.path.insert(0, os.path.dirname(__filename__))

# Import the FastAPI instance from server.py
from server import app as application
