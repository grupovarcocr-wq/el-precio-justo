# Publicar este repo

El create vía `gh` falló (token de integración sin permiso). Creá el repo vacío en GitHub y empujá:

```bash
# En GitHub: New repository → grupovarcocr-wq/equipo-verde-baby (público, sin README)
cd /agent/repos/equipo-verde-baby
git remote set-url origin https://github.com/grupovarcocr-wq/equipo-verde-baby.git
git push -u origin main
```

Remote ya apunta a ese URL.
