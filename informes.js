function abrirInforme(tipo) {
    document.getElementById('zona-opciones-informe').innerHTML =
      '<div style="margin-top:32px;text-align:center;color:#444;font-size:1.3em;">Has seleccionado: <b>' + tipo.charAt(0).toUpperCase() + tipo.slice(1) + '</b></div>';
}
