# usage: bash shot.sh out.png "query" W,H   (fresh Chrome profile per shot)
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"; D=$(cygpath -w "$PWD"); U="file:///$(cygpath -m "$PWD")/shots/${PAGE:-fake.html}"
timeout 60 "$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$D\prof_$RANDOM$RANDOM" --window-size=$3 --screenshot="$D\shots/$1" "$U?$2" 2>&1 | tail -1
