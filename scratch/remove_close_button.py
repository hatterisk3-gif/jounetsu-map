import os
import glob

# The exact button string to remove
button_str = '<button onclick="location.href=\'index2.html\'" style="position: fixed; top: 10px; left: 10px; width: 44px; height: 44px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; font-size: 28px; font-weight: bold; z-index: 9999; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3); padding-bottom: 4px;">×</button>\n'
# Just in case there is no newline:
button_str_no_nl = '<button onclick="location.href=\'index2.html\'" style="position: fixed; top: 10px; left: 10px; width: 44px; height: 44px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; font-size: 28px; font-weight: bold; z-index: 9999; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3); padding-bottom: 4px;">×</button>'


html_files = glob.glob('*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    content = content.replace(button_str, '')
    content = content.replace(button_str_no_nl, '')
    
    if content != original_content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Removed from {file}")
