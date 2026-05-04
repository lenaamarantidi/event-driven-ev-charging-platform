import streamlit as st
import pandas as pd
import time

# --- Imports από τα modular αρχεία ---
from utils.state import init_session_state
from ui.styles import load_css
from auth.login import login_page
from utils.loc import locate_user
from utils.api import fetch_chargers
from utils.filt import filter_chargers
from ui.map_view import display_map
from ui.panels import display_charger_info

# Imports λειτουργιών
from features.charging import display_charging_options, simulate_charging, display_summary
from features.payments import payment_form

# --- Page Config ---
st.set_page_config(page_title="Chargerio", page_icon="⚡", layout="wide")

# 1. Αρχικοποίηση Session State
init_session_state()

# 2. Έλεγχος Authentication
if not st.session_state['authentication_status']:
    # Αν ο χρήστης δεν είναι συνδεδεμένος, δείχνουμε μόνο το Login Page
    login_page()

else:
    # --- Main Application ---
    
    # Φόρτωση CSS
    load_css()

    # Header
    with st.container():
        c1, c2 = st.columns([2, 4])
        with c1:
            st.markdown('<div class="app-title">Electric Chargers</div>', unsafe_allow_html=True)
        with c2:
            st.text_input("search", placeholder="🔍 Search for location", label_visibility="collapsed", key="search_input")

    # Tabs (Home & Account)
    tab_home, tab_account = st.tabs(["HOME", "ACCOUNT"])

    # --- TAB: HOME ---
    with tab_home:
        
        # Sidebar: Logout & Filters
        with st.sidebar:
            if st.button("🚪 Logout", use_container_width=True):
                st.session_state['authentication_status'] = False
                st.session_state['token'] = None
                st.rerun()
            
            st.divider()
            st.header('Filter Options')
            f_type = st.multiselect("Type", ["AC", "DC"], default=[])
            f_cost = st.slider("Cost (€/kWh)", 0.0, 1.0, 1.0)
            f_avail = st.multiselect("Availability", ["available", "charging", "reserved", "offline"], default=[])
            f_dist = st.slider("Distance (km)", 0, 50, 50)
            f_power = st.checkbox("High Power (>22kW)")

        # Εντοπισμός Χρήστη
        user_lat, user_lon, loc_source = locate_user()

        # Λήψη Δεδομένων (API)
        res, err = fetch_chargers()
        chargers_df = pd.DataFrame()

        if err:
            st.markdown(f'<div class="error-box"><h3>Connection error: {err}</h3></div>', unsafe_allow_html=True)
        elif res and res.status_code == 200:
            data = res.json()
            if data:
                chargers_df = pd.DataFrame(data)
                # Καθαρισμός δεδομένων (numeric conversion)
                chargers_df['lat'] = pd.to_numeric(chargers_df['lat'], errors='coerce')
                chargers_df['lon'] = pd.to_numeric(chargers_df['lon'], errors='coerce')
                chargers_df['kwhprice'] = pd.to_numeric(chargers_df.get('kwhprice', 0), errors='coerce')
                chargers_df['cap'] = pd.to_numeric(chargers_df.get('cap', 0), errors='coerce')
                chargers_df = chargers_df.dropna(subset=['lat', 'lon'])
                
                # Φιλτράρισμα (Logic from utils/filt.py)
                chargers_df = filter_chargers(chargers_df, f_avail, f_cost, f_power, f_type, f_dist, user_lat, user_lon)
        
        # Έλεγχος αν έμειναν φορτιστές μετά τα φίλτρα
        if chargers_df.empty and not err:
            st.markdown('<div class="error-box"><h3>No available chargers with the selected filters</h3></div>', unsafe_allow_html=True)
        
        elif not chargers_df.empty:
            # Layout: Map vs Info Panel
            if st.session_state['selected_id'] != "None":
                col_map, col_info = st.columns([3, 1])
            else:
                col_map, = st.columns([1])
                col_info = None

            # A. Εμφάνιση Χάρτη
            with col_map:
                display_map(chargers_df, user_lat, user_lon)

            # B. Εμφάνιση Panel & Διαδικασία Φόρτισης
            if col_info:
                with col_info:
                    # Εμφανίζει πληροφορίες και επιστρέφει το αντικείμενο του επιλεγμένου φορτιστή
                    selected_charger = display_charger_info(chargers_df)
                    
                    if selected_charger is not None:
                        st.divider()
                        
                        # Διαχείριση Κατάστασης Φόρτισης (State Machine)
                        state = st.session_state['charging_state']

                        if state == 'idle':
                            display_charging_options(selected_charger)
                        
                        elif state == 'payment':
                            payment_form()
                        
                        elif state == 'charging':
                            simulate_charging(selected_charger)
                        
                        elif state == 'summary':
                            display_summary(selected_charger)

    # --- TAB: ACCOUNT ---
    with tab_account:
        st.header("👤 My Account")
        if st.session_state['token']:
             st.info(f"Logged in as User (Token active)")
        st.divider()
        st.subheader("💳 Saved Payment Methods")

        if st.session_state['saved_card']:
            card_num = st.session_state['saved_card']['number']
            last_four = card_num[-4:] if len(card_num) >= 4 else card_num
            st.success(f"**Card ending in •••• {last_four}**")
            st.caption(f"Expires: {st.session_state['saved_card']['exp']}")
            
            if not st.session_state['confirm_delete_card']:
                if st.button("🗑️ Remove Card"):
                    st.session_state['confirm_delete_card'] = True
                    st.rerun()
            else:
                st.warning("⚠️ Are you sure you want to remove this card?")
                col_yes, col_no = st.columns(2)
                if col_yes.button("Yes, remove it", type="primary", use_container_width=True):
                    st.session_state['saved_card'] = None
                    st.session_state['confirm_delete_card'] = False
                    st.toast("Card removed successfully", icon="🗑️")
                    st.rerun()
                if col_no.button("Cancel", use_container_width=True):
                    st.session_state['confirm_delete_card'] = False
                    st.rerun()
        else:
            st.warning("No saved cards found.")