import streamlit as st

def init_session_state():
    defaults = {
        'authentication_status': False,
        'token': None,
        'modal_state': None,
        'selected_id': 'None',
        'nav_error': False,
        'charging_state': 'idle',
        'session_metrics': {'kwh': 0.0, 'cost': 0.0, 'duration': 0},
        'confirm_delete_card': False,
        'saved_card': None
    }

    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value