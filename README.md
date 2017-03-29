# Spectrum 

A JavaScript library for image manipulation.

## Features

 - Ability to read `.png` and `.ppm` (and similar) files.
 - Ability to manipulate images by pixel.
 - Asynchronous execution.
 - Minimalistic CLI interface language.

## Examples

    const Image = require("spectrumjs").Image;
    Image.fromFile("cat.png").invert().output("scary-cat.png");

This inverts each RGB value, then writes the result to `scary-cat.png`.