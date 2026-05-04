import streamlit as st
from geopy.geocoders import Nominatim
from streamlit_js_eval import get_geolocation

def locate_user():
    # User location (3 ways)

    # 1. default
    user_lat, user_lon = 37.9755, 23.7348 # Syntagma Square, Athens, Greece
    location_source = "default"

    # 2. GPS
    loc = get_geolocation()
    # Ελέγχουμε αν υπάρχει το loc και αν έχει μέσα το κλειδί 'coords'
    if loc and 'coords' in loc:
        user_lat = loc['coords']['latitude']
        user_lon = loc['coords']['longitude']
        location_source = "gps"
    else:
        # Αν αποτύχει το GPS, κρατάμε τις default (Σύνταγμα)
        pass


    # 3. Type & Research
    if 'search_input' in st.session_state and st.session_state.search_input:
        geolocator = Nominatim(user_agent="my_ev_app")
        try:
            location = geolocator.geocode(st.session_state.search_input)
            if location:
                user_lat = location.latitude
                user_lon = location.longitude
                location_source = "search"
            else:
                st.toast("Location not found via search", icon="⚠️")
        except:
            st.toast("Error connecting to geocoding service", icon="❌")

    return (user_lat, user_lon, location_source)