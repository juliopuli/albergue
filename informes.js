function abrirInforme(tipo) {
    document.getElementById('zona-opciones-informe').innerHTML =
      '<b>Has seleccionado:</b> ' + tipo.charAt(0).toUpperCase() + tipo.slice(1);
}
