from flask import Flask, render_template, request    # pyright: ignore[reportMissingImports]
import json
import random
app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route('/inscription', methods=["GET", "POST"])
def inscription():
    if request.method == "POST":
        prenom = request.form.get('prénom')
        motdepasse = request.form.get('motdepasse')
        with open("user.json", "r") as f:
            utilisateurs = json.load(f)
        utilisateurs.append({"prénom": prenom, "motdepasse": motdepasse})
        with open("user.json", "w") as f:
            json.dump(utilisateurs, f)
        return render_template("main_menu.html")
    return render_template("inscription.html")

@app.route('/connexion', methods=["GET","POST"])
def connexion():
    prenom = request.form.get('prénom')
    motdepasse = request.form.get('motdepasse')
    with open("user.json", "r") as f:
         utilisateurs = json.load(f)
    for k in utilisateurs:
        if k.get("prénom") == prenom and k.get("motdepasse") == motdepasse:
            return render_template("main_menu.html", prenom=prenom)
    return render_template("connexion.html")

@app.route('/dave_dice', methods=["GET", "POST"])
def dave_dice():
    if request.method == "POST":
        return render_template("dave_dice.html")
    return render_template("dave_dice.html")

@app.route('/dave_machine', methods=["GET", "POST"])
def dave_machine():
    if request.method == "POST":
        return render_template("dave_machine.html")
    return render_template("dave_machine.html")

@app.route('/dave_roulette', methods=["GET", "POST"])
def dave_roulette():
    if request.method == "POST":
        return render_template("dave_roulette.html")
    return render_template("dave_roulette.html")

@app.route('/dave_jack', methods=["GET", "POST"])
def dave_jack():
    if request.method == "POST":
        return render_template("dave_jack.html")
    return render_template("dave_jack.html")

@app.route('/dice_exe', methods=["GET", "POST"])
def dice_exe():
    nombre = request.form.get('nombre')
    nombre_gagnant= random.randint(1, 6)


if __name__ == "__main__":
    app.run(debug=True)

