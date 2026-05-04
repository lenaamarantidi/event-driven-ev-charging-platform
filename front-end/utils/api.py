import requests
import urllib3
from config import BASE_URL

# Disable SSL warnings globally for requests used here
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def login_user(username, password):
    try:
        response = requests.post(
            f"{BASE_URL}/login", 
            json={"username": username, "password": password},
            verify=False
        )
        return response, None
    except Exception as e:
        return None, e

def signup_user(username, password):
    try:
        response = requests.post(
            f"{BASE_URL}/signup",
            json={"username": username, "password": password},
            verify=False
        )
        return response, None
    except Exception as e:
        return None, e

def fetch_chargers():
    try:
        url = f"{BASE_URL}/points"
        response = requests.get(url, verify=False)
        return response, None
    except Exception as e:
        return None, e

def reserve_point(point_id, duration_minutes=30):
    try:
        response = requests.post(
            f"{BASE_URL}/reserve/{point_id}/{duration_minutes}", 
            verify=False
        )
        return response, None
    except Exception as e:
        return None, e

def save_session(payload):
    try:
        response = requests.post(
            f"{BASE_URL}/newsession", 
            json=payload, 
            verify=False
        )
        return response, None
    except Exception as e:
        return None, e