#!/usr/bin/env python3
"""Clean vector recreation of the ITS AHA form (IS_F_222_EN.2203), US Letter.
Generates: aha-clean-template.pdf (blank) and aha-clean-filled.pdf (sample data).
All geometry defined here in top-down coordinates; T(y) converts to PDF space.
"""
import io, random
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.utils import ImageReader

PW, PH = 612.0, 792.0
L, R = 45.0, 567.0
MID = 306.0

BAR = (0.28, 0.33, 0.30)
BORDER = (0.55, 0.55, 0.55)
LABEL = (0.40, 0.40, 0.40)
BLACK = (0.10, 0.10, 0.10)
INK = (0.08, 0.08, 0.35)
SIGC = (0.10, 0.14, 0.55)
HI = (1.0, 0.90, 0.15)

def T(y): return PH - y

def wrap(text, font, size, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if stringWidth(t, font, size) <= max_w:
            cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def fit_line(c, x, y, text, max_w, size=9.0, font="Helvetica"):
    while stringWidth(text, font, size) > max_w and size > 5.4:
        size -= 0.2
    c.setFont(font, size); c.drawString(x, T(y), text)

def fill_wrapped(c, x, y, max_w, text, size, lh, max_lines):
    lines = wrap(text, "Helvetica", size, max_w)
    while len(lines) > max_lines and size > 5.4:
        size -= 0.3
        lines = wrap(text, "Helvetica", size, max_w)
    c.setFont("Helvetica", size)
    for i, ln in enumerate(lines[:max_lines]):
        c.drawString(x, T(y + i * lh), ln)

def label(c, x, y, text, size=7.5):
    c.setFillColorRGB(*LABEL); c.setFont("Helvetica", size)
    c.drawString(x, T(y), text)

def hline(c, x0, x1, y, wdt=0.7):
    c.setStrokeColorRGB(*BORDER); c.setLineWidth(wdt); c.line(x0, T(y), x1, T(y))

def vline(c, x, y0, y1, wdt=0.7):
    c.setStrokeColorRGB(*BORDER); c.setLineWidth(wdt); c.line(x, T(y0), x, T(y1))

def box(c, x0, y0, x1, y1, wdt=0.8):
    c.setStrokeColorRGB(*BORDER); c.setLineWidth(wdt)
    c.rect(x0, T(y1), x1 - x0, y1 - y0, stroke=1, fill=0)

def checkbox(c, x, y, s=8.0):
    c.setStrokeColorRGB(*BLACK); c.setLineWidth(0.8)
    c.rect(x, T(y), s, s, stroke=1, fill=0)
    return (x, y - s, x + s, y)  # x0, y_top, x1, y_bot (top-down box)

def draw_x(c, bx, color=INK):
    x0, yt, x1, yb = bx
    c.setStrokeColorRGB(*color); c.setLineWidth(1.3)
    c.line(x0 + 1, T(yt + 1), x1 - 1, T(yb - 1))
    c.line(x0 + 1, T(yb - 1), x1 - 1, T(yt + 1))

def squiggle(c, x0, x1, y, seed):
    rnd = random.Random(seed)
    yb = T(y)
    width = min(x1 - x0, 75 + rnd.random() * 40)
    p = c.beginPath(); p.moveTo(x0, yb)
    n = rnd.randint(3, 5); step = width / n; x = x0
    for _ in range(n):
        p.curveTo(x + step*0.3, yb + rnd.uniform(4, 13), x + step*0.7, yb - rnd.uniform(3, 11), x + step, yb + rnd.uniform(-2, 3))
        x += step
    c.setStrokeColorRGB(*SIGC); c.setLineWidth(1.2); c.drawPath(p)

# ------------------------------------------------------------------ sample data
DATA = dict(
    location="I-40 / Business 40 utility relocation - Sta. 114+50 to 128+00, EB shoulder near Exit 285, Raleigh, NC",
    date="14-08-2026", jha="JHA-2026-0147, SOP-114, ITS-EXC-09",
    pic="Miguel Rodriguez", emeg_num="911 / Site safety: (919) 555-0182",
    centre="WakeMed Raleigh Campus - 3000 New Bern Ave",
    rescue_yes=True, wo="WO-88213 / Permit E-4471", muster="North parking lot, gate 3",
    desc=("Excavation and directional bore for fiber conduit relocation along EB shoulder; potholing existing "
          "utilities; loading and hauling spoils. Adjacent lane closures with live traffic; paving crew working "
          "200 ft east of Sta 126 (simultaneous operations)."),
    tasks=[
        ("Excavation around existing utilities", "Cave-in, mobile equipment, underground utilities, slips/trips",
         "Daily excavation inspection, sloping/protective system, spotter, locates verified, barricades"),
        ("Directional bore under roadway", "Rotating equipment, pinch points, hydraulic pressure, live traffic",
         "Machine guarding, two-person operation, cones/flagger, hands clear of rotating rod"),
        ("Loading spoils / haul-off", "Overhead loads, mobile equipment, dust",
         "Exclusion zone, spotter, backup alarms verified, dust suppression, hard hats/hi-vis"),
        ("Potholing / hand digging near gas main", "Line strike, flammable atmosphere",
         "Hand dig within 24 in of marks, gas monitor, no spark-producing tools, utility standby"),
        ("Traffic control setup / teardown", "Live traffic, struck-by",
         "TTC per plan, taper per MUTCD, class 3 hi-vis, work behind barrier where possible"),
        ("Housekeeping / demob", "Slips/trips, manual handling",
         "Clear walkways, team lifts over 50 lb, cut-resistant gloves"),
    ],
    notes=("Reviewed lane closure timing with DOT inspector; paving crew east of Sta 126 - coordinate truck access; "
           "heat advisory after 1 PM - water/shade breaks every hour."),
    energy={
        "Gravity": ["Excavation cave-in", "Falling or sliding materials/objects", "Slips/trips/falls"],
        "Motion": ["Vehicles/vessels/mobile equipment", "Wind", "Ergonomics"],
        "Mechanical": ["Rotating equipment", "Tool/equipment nip points/pinch points"],
        "Electrical": ["Electrical equipment/lines - normal or abnormal condition (shock or arc flash)", "Induced voltage"],
        "Human factors": [],
    },
    gate_yes=True,
    crew=["Miguel Rodriguez", "Juan Lopez", "David Garcia", "Chris Boone", "Terrell Whitaker",
          "Jose Martinez", "Roberto Diaz", "Luis Hernandez", "Sam Nguyen", "Alek Petrov"],
)

# ------------------------------------------------------------------ FRONT PAGE
def draw_front(c, data=None):
    # title + logo
    c.setFillColorRGB(*BLACK); c.setFont("Helvetica-Bold", 19)
    c.drawString(L, T(58), "Activity Hazard Analysis")
    logo = ImageReader("/mnt/user-data/uploads/its-logo.png")
    c.drawImage(logo, R - 128, T(70), width=128, height=64, mask='auto')
    # header block
    y0 = 88.0
    rows = [46, 30, 30, 32, 30, 50]
    ys = [y0]
    for h in rows: ys.append(ys[-1] + h)
    box(c, L, ys[0], R, ys[6])
    for i in range(1, 6): hline(c, L, R, ys[i])
    for i in (1, 2, 3, 4): vline(c, MID, ys[i], ys[i + 1])
    label(c, L + 6, ys[0] + 12, "Location:")
    label(c, L + 6, ys[1] + 12, "Date (dd-mm-yyyy):")
    label(c, MID + 6, ys[1] + 12, "JHA / procedure numbers:")
    label(c, L + 6, ys[2] + 12, "Person in charge:")
    label(c, MID + 6, ys[2] + 12, "Emergency number:")
    label(c, L + 6, ys[3] + 12, "Closest emergency centre:")
    c.setFillColorRGB(*BLACK); c.setFont("Helvetica", 7.5)
    c.drawString(MID + 6, T(ys[3] + 13), "Is a rescue plan required for the work being performed?")
    rq_end = MID + 6 + stringWidth("Is a rescue plan required for the work being performed?", "Helvetica", 7.5)
    yes_bx = checkbox(c, rq_end + 6, ys[3] + 15, 8)
    c.setFillColorRGB(*BLACK); c.setFont("Helvetica", 7.5); c.drawString(rq_end + 17, T(ys[3] + 13), "Yes")
    no_bx = checkbox(c, rq_end + 34, ys[3] + 15, 8)
    c.drawString(rq_end + 45, T(ys[3] + 13), "No")
    label(c, L + 6, ys[4] + 12, "Work order / permit number:")
    label(c, MID + 6, ys[4] + 12, "Muster point:")
    label(c, L + 6, ys[5] + 12, "Description of work performed on site and activities happening in the vicinity of work area:")
    # task table
    tt = 318.0; th = 18.0; rh = 24.0; nrows = 15
    tb = tt + th + rh * nrows
    c.setFillColorRGB(*BAR)
    c.rect(L, T(tt + th), R - L, th, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1); c.setFont("Helvetica-Bold", 9)
    c.drawString(L + 6, T(tt + 13), "Task")
    c.drawString(224, T(tt + 13), "Hazards")
    c.drawString(398, T(tt + 13), "Controls")
    box(c, L, tt + th, R, tb)
    for i in range(1, nrows): hline(c, L, R, tt + th + i * rh, 0.5)
    vline(c, 219, tt + th, tb); vline(c, 393, tt + th, tb)
    # notes box
    nt = tb + 10
    box(c, L, nt, R, nt + 46)
    label(c, L + 6, nt + 12, "Specific instructions/items discussed during on-site meeting:")
    c.setFillColorRGB(*LABEL); c.setFont("Helvetica", 6.5)
    c.drawRightString(R, T(nt + 58), "IS_F_222_EN.2203")
    # ---------------- fill ----------------
    if data:
        c.setFillColorRGB(*INK)
        fill_wrapped(c, L + 95, ys[0] + 13, R - L - 105, data["location"], 8.8, 12, 2)
        fit_line(c, L + 130, ys[1] + 13, data["date"], 150)
        fit_line(c, MID + 116, ys[1] + 13, data["jha"], R - MID - 122, 8.5)
        fit_line(c, L + 90, ys[2] + 13, data["pic"], 200)
        fit_line(c, MID + 90, ys[2] + 13, data["emeg_num"], R - MID - 96, 8.5)
        fill_wrapped(c, L + 10, ys[3] + 24, MID - L - 20, data["centre"], 8.0, 9.5, 1)
        draw_x(c, yes_bx if data["rescue_yes"] else no_bx)
        fit_line(c, L + 125, ys[4] + 13, data["wo"], 170)
        fit_line(c, MID + 62, ys[4] + 13, data["muster"], R - MID - 68, 8.5)
        fill_wrapped(c, L + 6, ys[5] + 25, R - L - 12, data["desc"], 8.3, 11, 3)
        for i, (task, haz, ctl) in enumerate(data["tasks"]):
            top = tt + th + i * 2 * rh + 11
            for x, w, text in ((L + 5, 219 - L - 10, task), (224, 393 - 224 - 10, haz), (398, R - 398 - 6, ctl)):
                fill_wrapped(c, x, top, w, text, 7.2, 8.8, 5)
        fill_wrapped(c, L + 6, nt + 24, R - L - 12, data["notes"], 8.0, 10, 2)

# ------------------------------------------------------------------ BACK PAGE
EROWS = [
    ("Gravity", [], ["Excavation cave-in", "Falling or sliding materials/objects"], ["Slips/trips/falls", "Working at heights"], []),
    ("Motion", [], ["Wind", "Road/ground conditions", "Flying particles/debris", "Simultaneous operations"],
     ["Watercourses", "Ergonomics", "Congestion", "Vehicles/vessels/mobile equipment"], []),
    ("Mechanical", [], ["Tool/equipment nip points/pinch points", "Vibration"], ["Rotating equipment"], []),
    ("Electrical", ["Electrical equipment/lines - normal or abnormal condition (shock or arc flash)"],
     ["Non-intrinsically safe tools/equipment", "Static electricity"], ["Induced voltage"], []),
    ("Pressure", [], ["Compressed cylinders", "Pressurized piping/hoses/equipment"], ["Tanks/vessels", "Pressure relief systems"], []),
    ("Sound", [], ["Tools/equipment", "Pressure relief systems"], ["Purging"], []),
    ("Radiation", [], ["Welding arc", "NDT/X-ray", "NORM"], ["Infrared scanners", "Sun"], []),
    ("Biological", [], ["Plants", "Insects", "Needles", "Reptiles", "Viruses"],
     ["Animals", "Mold", "Bloodborne pathogens", "Birds", "Bacteria"], []),
    ("Chemical", [], ["Flammable/combustible", "Toxic vapors/dusts/fibers/fumes"], ["Corrosive", "Skin/eye irritants"],
     ["Designated substances, pipeline contaminants, spills, suspect soils", "Reactive"]),
    ("Temperature", [], ["Cold surfaces (Nitrogen, LNG, propane)", "Hot surfaces (friction, heat sources)", "Hot emissions/vapors"],
     ["Weather conditions", "Ignition sources"], []),
    ("Human factors", [], ["Knowledge/skill", "Risk tolerance", "Working alone", "Training"],
     ["Communication", "Fit for duty", "Deviation from plan"], []),
]
WEDGES = dict(Gravity=(72, 36), Motion=(36, 36), Mechanical=(0, 36), Electrical=(-36, 36),
              Pressure=(-72, 36), Sound=(-108, 36), Radiation=(-144, 36), Biological=(180, 36),
              Chemical=(144, 36), Temperature=(108, 36))

def draw_back(c, data=None):
    hline(c, L, R, 38, 0.9)
    c.setFillColorRGB(*BLACK); c.setFont("Helvetica-Bold", 12)
    c.drawString(L, T(54), "Energy wheel")
    hline(c, L, R, 60, 0.9)
    # wheel image
    WX, WY, WS = 45.0, 80.0, 190.0
    c.drawImage(ImageReader("/home/claude/wheel.png"), WX, T(WY + WS), width=WS, height=WS, mask=None)
    wcx, wcy = WX + WS / 2, T(WY + WS / 2)
    # energy table
    ex0, ex1 = 240.0, R
    et = 72.0; eth = 16.0
    c.setFillColorRGB(*BAR); c.rect(ex0, T(et + eth), ex1 - ex0, eth, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1); c.setFont("Helvetica-Bold", 8)
    c.drawString(ex0 + 5, T(et + 11.5), "Energy type")
    c.drawString(ex0 + 74, T(et + 11.5), "Examples")
    fs, lh, pad = 6.4, 8.0, 7.0
    y = et + eth
    row_rects = {}
    line_rects = {}  # (category, example string) -> (x, y_baseline_topdown, text width)
    def draw_ex(cat, x, yb, line):
        c.drawString(x, T(yb), u"\u2022 " + line)
        line_rects[(cat, line)] = (x, yb, stringWidth(u"\u2022 " + line, "Helvetica", fs))
    for name, wb, lft, rgt, wa in EROWS:
        n = len(wb) + max(len(lft), len(rgt)) + len(wa)
        h = pad + n * lh
        row_rects[name] = (y, y + h)
        c.setFillColorRGB(*BLACK); c.setFont("Helvetica-Bold", 7)
        c.drawString(ex0 + 5, T(y + 10), name)
        c.setFont("Helvetica", fs)
        yy = y + 10
        for line in wb:
            draw_ex(name, ex0 + 78, yy, line); yy += lh
        ly = yy
        for line in lft:
            draw_ex(name, ex0 + 78, ly, line); ly += lh
        ry = yy
        for line in rgt:
            draw_ex(name, ex0 + 210, ry, line); ry += lh
        yy = max(ly, ry)
        for line in wa:
            draw_ex(name, ex0 + 78, yy, line); yy += lh
        y += h
        hline(c, ex0, ex1, y, 0.5)
    box(c, ex0, et + eth, ex1, y)
    vline(c, ex0 + 70, et + eth, y, 0.5)
    eb = y
    # gate
    gy = eb + 24
    c.setFillColorRGB(*BLACK); c.setFont("Helvetica-Bold", 9)
    gtxt = "Have all known hazards been identified and addressed using the energy wheel?"
    c.drawString(L, T(gy), gtxt)
    gend = L + stringWidth(gtxt, "Helvetica-Bold", 9)
    gyes = checkbox(c, gend + 7, gy + 2, 8)
    c.setFillColorRGB(*BLACK); c.setFont("Helvetica", 8); c.drawString(gend + 18, T(gy), "Yes")
    gno = checkbox(c, gend + 37, gy + 2, 8)
    c.drawString(gend + 48, T(gy), "No")
    c.setFillColorRGB(*BLACK); c.setFont("Helvetica-Bold", 9)
    c.drawString(L, T(gy + 15), '(Do not proceed until you can answer "yes")')
    # sign-off
    sy = gy + 32
    hline(c, L, R, sy, 0.9)
    c.setFont("Helvetica-Bold", 11); c.drawString(L, T(sy + 16), "Worker/visitor sign off")
    hline(c, L, R, sy + 23, 0.9)
    c.setFillColorRGB(*BLACK); c.setFont("Helvetica", 8)
    p1 = wrap("All workers/visitors must review and sign this form prior to commencing work or upon arrival to the site "
              "and repeat process if there are any changes to tasks or site conditions.", "Helvetica", 8, R - L)
    py = sy + 38
    for ln in p1:
        c.drawString(L, T(py), ln); py += 10
    c.setFont("Helvetica-Bold", 8)
    p2 = wrap("Worker/visitor: I have reviewed all applicable documentation, site hazards, and my responsibilities to "
              "follow safe work plans to protect myself and others while on site.", "Helvetica-Bold", 8, R - L)
    py += 4
    for ln in p2:
        c.drawString(L, T(py), ln); py += 10
    # sign table
    st = py + 6; sth = 16.0; srh = 27.0; srows = 5
    sb = st + sth + srh * srows
    c.setFillColorRGB(*BAR); c.rect(L, T(st + sth), R - L, sth, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1); c.setFont("Helvetica-Bold", 7.5)
    c.drawString(L + 5, T(st + 11), "Worker/visit name")
    c.drawString(178, T(st + 11), "Worker/visitor signature")
    c.drawString(320, T(st + 11), "Worker/visit name")
    c.drawString(444, T(st + 11), "Worker/visitor signature")
    box(c, L, st + sth, R, sb)
    for i in range(1, srows): hline(c, L, R, st + sth + i * srh, 0.5)
    for x in (173, 315, 439): vline(c, x, st + sth, sb, 0.5)
    c.setFillColorRGB(*LABEL); c.setFont("Helvetica", 6.5)
    c.drawRightString(R, T(sb + 12), "IS_F_222_EN.2203")
    # ---------------- fill ----------------
    if data:
        # wheel + table highlights
        c.saveState()
        Rr = WS / 2
        c.setFillColorRGB(*HI); c.setFillAlpha(0.38)
        for name, marked in data["energy"].items():
            if name in WEDGES:
                s0, ext = WEDGES[name]
                fr = 0.815 * Rr
                c.wedge(wcx - fr, wcy - fr, wcx + fr, wcy + fr, s0, ext, stroke=0, fill=1)
            else:  # Human factors -> centre circle
                c.circle(wcx, wcy, 0.255 * Rr, stroke=0, fill=1)
            # Change Order 1: highlight the category-name cell, not the full row
            y0r, y1r = row_rects[name]
            c.rect(ex0 + 1, T(y1r) + 1, 68, (y1r - y0r) - 2, stroke=0, fill=1)
            # ...and each marked example's bullet line
            for line in marked:
                if (name, line) in line_rects:
                    lx, lyb, lw = line_rects[(name, line)]
                    c.rect(lx - 1.5, T(lyb) - 2, lw + 3, 8.4, stroke=0, fill=1)
                else:
                    print("WARN: marked example not found on form:", name, "|", line)
        c.setStrokeColorRGB(*HI); c.setStrokeAlpha(0.45); c.setLineWidth(0.115 * Rr)
        rr = 0.90 * Rr
        for name in data["energy"]:
            if name in WEDGES:
                s0, ext = WEDGES[name]
                c.arc(wcx - rr, wcy - rr, wcx + rr, wcy + rr, s0, ext)
        c.restoreState()
        draw_x(c, gyes if data["gate_yes"] else gno)
        for i, nm in enumerate(data["crew"]):
            row = i % 5; side = i // 5
            yb = st + sth + row * srh + 18
            if side == 0:
                nx, s0x, s1x = L + 5, 185, 300
            else:
                nx, s0x, s1x = 320, 450, 560
            c.setFillColorRGB(*INK); c.setFont("Helvetica", 8.5)
            c.drawString(nx, T(yb), nm)
            squiggle(c, s0x, s1x, yb - 3, seed=hash(nm) & 0xFFFF)

def build(path, data):
    c = canvas.Canvas(path, pagesize=(PW, PH))
    draw_front(c, data); c.showPage()
    draw_back(c, data); c.showPage()
    c.save()

if __name__ == "__main__":
    build("/home/claude/aha-clean-template.pdf", None)
    build("/home/claude/aha-clean-filled.pdf", DATA)
    print("built both")
