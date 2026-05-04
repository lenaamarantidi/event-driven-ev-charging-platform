import streamlit as st
import folium
from streamlit_folium import st_folium
import numpy as np

def display_map(chargers_df, user_lat, user_lon):
    
    # 1. Navigation Error
    if st.session_state['nav_error']:
        st.markdown("""
        <div class="nav-error-box">
            Unable to retrieve navigation directions. Please try again later.
        </div>
        """, unsafe_allow_html=True)
        if st.button("Close Error"):
            st.session_state['nav_error'] = False
            st.rerun()

    # 2. Warning Modal (for unavailable chargers)
    elif st.session_state['modal_state'] == 'warning':
        st.markdown("""
        <div class="modal-box">
            <strong>WARNING:</strong><br>
            The selected charger is currently unavailable.<br>
            Are you sure you want to continue?<br><br>
        </div>
        """, unsafe_allow_html=True)
        _, m_c2, _ = st.columns([1,1,1])
        with m_c2:
            sc1, sc2 = st.columns(2)
            if sc1.button("Yes", key="warn_yes"):
                st.session_state['modal_state'] = 'google_maps'
                st.rerun()
            if sc2.button("No", key="warn_no"):
                st.session_state['modal_state'] = None
                st.rerun()

    # 3. Google Maps Modal (exit confirmation)
    elif st.session_state['modal_state'] == 'google_maps':
        # Create URL based on selected charger
        target_url = "https://maps.google.com"
        if st.session_state['selected_id'] != "None" and not chargers_df.empty:
            sel_charger = chargers_df[chargers_df['pointid'] == st.session_state['selected_id']].iloc[0]
            target_url = f"https://www.google.com/maps/search/?api=1&query={sel_charger['lat']},{sel_charger['lon']}"

        st.markdown("""
        <div class="modal-box">
            <strong>Start navigation in Google Maps?</strong><br><br>
        </div>
        """, unsafe_allow_html=True)
        _, m_c2, _ = st.columns([1,1,1])
        with m_c2:
            sc1, sc2 = st.columns(2)
            sc1.link_button("Yes", target_url)
            if sc2.button("No", key="gm_no"):
                st.session_state['modal_state'] = None
                st.rerun()

    # 4. Folium map
    my_map = folium.Map(location=[user_lat, user_lon], zoom_start=14)

    # User marker
    folium.Marker(
        [user_lat, user_lon], 
        tooltip="You are here", 
        icon=folium.Icon(color='blue', icon='home')
    ).add_to(my_map)

    # Charger markers
    if not chargers_df.empty:
        for _, row in chargers_df.iterrows():
            color = 'green' if row['status'] == 'available' else 'red'
            folium.Marker(
                [row['lat'], row['lon']],
                tooltip=f"ID: {row['pointid']} ({row['status']})",
                icon=folium.Icon(color=color, icon='bolt', prefix='fa')
            ).add_to(my_map)

    # 5. Click Logic
    map_data = st_folium(my_map, width=None, height=550)

    if map_data and map_data.get('last_object_clicked'):
        clicked_lat = map_data['last_object_clicked']['lat']
        clicked_lng = map_data['last_object_clicked']['lng']
        
        # Find nearest charger point
        if not chargers_df.empty:
            found_charger = chargers_df[
                (np.abs(chargers_df['lat'] - clicked_lat) < 0.0001) & 
                (np.abs(chargers_df['lon'] - clicked_lng) < 0.0001)
            ]
            
            if not found_charger.empty:
                new_id = found_charger.iloc[0]['pointid']
                if st.session_state['selected_id'] != new_id:
                    st.session_state['selected_id'] = new_id
                    st.rerun()