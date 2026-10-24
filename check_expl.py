import csv
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('admin_dashboard/public/police_bharti_300_curriculum.csv', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

with_expl = 0
placeholder = 0
for r in rows:
    e = r.get('Explanation', '').strip()
    if 'सराव प्रश्नपत्रिका स्पष्टीकरण' in e or not e:
        placeholder += 1
    else:
        with_expl += 1

print(f"Total: {len(rows)}, Detailed explanation: {with_expl}, Generic placeholder: {placeholder}")
