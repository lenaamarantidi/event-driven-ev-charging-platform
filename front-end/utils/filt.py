from utils.geo import haversine_vectorized

def filter_chargers(chargers_df, f_avail, f_cost, f_power, f_type, f_dist, user_lat, user_lon):
    # Apply Filters
                    
    # 1. Availability
    if f_avail:
        chargers_df = chargers_df[chargers_df['status'].isin(f_avail)]
                
    # 2. Price
    chargers_df = chargers_df[chargers_df['kwhprice'] <= f_cost] # f_cost: default if not manually selected
                
    # 3. Power
    if f_power:
        chargers_df = chargers_df[chargers_df['cap'] > 22]
    
    # 4. Type
    # ---------BAKC-END NEEDS TO BE UPDATED (or we don't use this filter)
    #----------right now there is no attribute "charger_type"
    #----------I made it up assuming that: <= 22kW is AC, > 22kW is DC
    #----------When backend is updated:
    # (i) remove these lines
    # (ii) replace (everywhere in this script) the name 'charger_type' with the name you used in backend
                    
    #---\/\/\/ REMOVE THESE LINES \/\/\/---#
    if 'cap' in chargers_df.columns:
        chargers_df['charger_type'] = chargers_df['cap'].apply(lambda x: 'AC' if x <= 22 else 'DC')
    else:
        chargers_df['charger_type'] = 'AC' # Default fallback
    #---/\/\/\ REMOVE THESE LINES /\/\/\---#
    if f_type:
        chargers_df = chargers_df[chargers_df['charger_type'].isin(f_type)]
                    
    # 5. Distance
    if not chargers_df.empty:
        # add collumn 'distance'
        chargers_df['distance'] = haversine_vectorized(
            user_lat, 
            user_lon, 
            chargers_df['lat'], 
            chargers_df['lon']
        )
        # apply f_dist filter
        chargers_df = chargers_df[chargers_df['distance'] <= f_dist]
            
    return chargers_df