import React, { useEffect, useRef } from 'react';
import { gsap, TimelineLite, Back, Sine, Power2, Power1, Power0 } from 'gsap'; 
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { SlowMo } from 'gsap/EasePack';
// LIGNE SUPPRIMÉE : N'importez PAS Snap ici
// import Snap from 'snapsvg'; 
import './DownloadAnimation.css';

gsap.registerPlugin(CustomEase, DrawSVGPlugin, SlowMo);

const DownloadAnimation = ({ text, onAnimationComplete }) => {
    const svgRef = useRef(null);

    // MODIFIÉ : Toute la logique est maintenant dans une fonction async
    // pour permettre l'importation dynamique de Snap.svg
    useEffect(() => {
        const setupAndRunAnimation = async () => {
            const svgElement = svgRef.current;
            if (!svgElement) return;
            
            // LIGNE AJOUTÉE : Importation dynamique de Snap.svg
            // Ceci garantit que le code n'est exécuté que côté client (navigateur)
            const Snap = (await import('snapsvg')).default;

            // Le reste de votre code, maintenant à l'intérieur de la fonction async
            let downloading = false, points = [];
            const btn = svgElement.querySelector('.btn');
            const dot = svgElement.querySelector('.dot');
            const textEl = svgElement.querySelector('.text');
            const mainCirc = svgElement.querySelector('.mainCircle');
            const subCirc = svgElement.querySelector('.subCircle');
            const mainCircFill = svgElement.querySelector('.mainCircleFill');
            const arrow = svgElement.querySelector('.arrow');
            const rect = svgElement.querySelector('.rect');

            gsap.set(rect, { transformOrigin: '50% 50%', rotation: 45 });
            gsap.set(textEl, { textContent: text });
            
            (function() {
                let data = Snap.path.toCubic('M0,0 a9,9 0 0,1 0,18 a9,9 0 0,1 0,-18');
                let dataLen = data.length;
                for (let i = 0; i < dataLen; i++) {
                    let seg = data[i];
                    if (seg[0] === 'M') {
                        points.push({ x: seg[1], y: seg[2] });
                    } else {
                        for (let j = 1; j < seg.length; j += 2) {
                            points.push({ x: seg[j], y: seg[j + 1] });
                        }
                    }
                }
            })();
            
            const animation = () => {
                if (downloading) return;
                downloading = true;
                
                let tl = new TimelineLite({ onComplete: restart });

                tl.to(arrow, .35, {y: 2.5, ease: CustomEase.create('custom', 'M0,0,C0.042,0.14,0.374,1,0.5,1,0.64,1,0.964,0.11,1,0')}, 'click')
                .to(textEl, .3, {svgOrigin: '55% 35%', scale: .77, ease: CustomEase.create('custom', 'M0,0,C0.042,0.14,0.374,1,0.5,1,0.64,1,0.964,0.11,1,0')}, 'click+=.05')
                .set(subCirc, {fillOpacity: 1, strokeOpacity: 1}, 'squeeze-=.3')
                .to(subCirc, .35, {fillOpacity: 0, ease: Power1.easeInOut}, 'squeeze-=.3')
                .to(subCirc, .45, {attr:{r: 13}, strokeOpacity: 0, className: '+=strokeW', ease: Power0.easeNone}, 'squeeze-=.3')
                .to(btn, .7, {attr:{d: 'M50,25 h0 a10,10 0 0,1 10,10 a10,10 0 0,1 -10,10 s0,0 0,0  a10,10 0 0,1 -10,-10 a10,10 0 0,1 10,-10 h0'}, ease: Sine.easeOut}, 'squeeze')
                .to([mainCirc, mainCircFill, rect, arrow], .7, {x: 30, ease: Sine.easeOut}, 'squeeze')
                .to(rect, .7, {fill: '#fff', rotation: 270, ease: Sine.easeOut}, 'squeeze')
                .to(textEl, .3, {autoAlpha: 0, y: 7}, 'squeeze')
                .to(arrow, .7, {attr:{d: 'M20,39 l3.5,-3.5 l-3.5,-3.5 M20,39 l-3.5,-3.5 l3.5,-3.5 M20,39 l0,0'}, transformOrigin: '50% 50%', rotation: 225, ease: Sine.easeOut}, 'squeeze')
                .to(dot, .4, {attr:{r: 1.5}, ease: Back.easeOut.config(7)})
                .set(subCirc, {drawSVG: 0, strokeOpacity: 1,  transformOrigin: '50% 50%', x: 30, rotation: -90, attr:{r: 9.07}})
                .to(subCirc, 3.5, {drawSVG: '102%', ease: Power2.easeIn}, 'fill+=.02')
                .to(dot, 3.5, {bezier:{values: points, type: 'cubic'}, attr:{r: 2.7} , ease: Power2.easeIn}, 'fill')
                .to('.gradient', 3.5, {attr:{offset: '0%'}, ease: Power2.easeIn}, 'fill')
                .to(dot, .44, {fill: '#02fc86', y: -22, ease: Power1.easeOut}, 'stretch-=.01')
                .to(dot, .27, {transformOrigin: '50% 50%', scaleX: .5, ease: SlowMo.ease.config(0.1, 2, true)}, 'stretch+=.04')
                .to(dot, .3, {scaleY: .6, ease: SlowMo.ease.config(0.1, 2, true)}, 'stretch+=.31')
                .to(dot, .44, {scaleX: .4, y: 22, ease: Power2.easeIn}, 'stretch+=.45')
                .to([mainCirc, subCirc, arrow, rect, mainCircFill], .33, {opacity: 0, ease: Power2.easeOut}, 'stretch+=.2')
                .set(dot, {opacity: 0}, 'stretch+=.875');

                tl.duration(5);
            };

            const restart = () => {
                if (onAnimationComplete) {
                    onAnimationComplete();
                }
            };

            animation();
        };

        setupAndRunAnimation();

    }, [text, onAnimationComplete]);

    return (
        <svg ref={svgRef} viewBox='0 0 100 50' width='620' height='310' fill='none'>
             {/* Le contenu du SVG reste identique */}
            <circle cx='20' cy='35' r='8.5' fill='#00cffc' className='mainCircle'></circle>
            <circle cx='20' cy='35' r='8.05' stroke='#00cffc' strokeWidth='.9' fill='url(#gradient)' className='mainCircleFill'></circle>
            <rect x='17.5' y='32.5' width='5' height='5' stroke='none' fill='#00cffc' className='rect'></rect>
            <path d='M20,39 l3.5,-3.5 l0,0 M20,39 l-3.5,-3.5 l0,0 M20,39 l0,-7.5' stroke='#fff' strokeLinecap='round' strokeWidth='.8' className='arrow'></path>
            <text x='55' y='36.5' fill='#fff' textAnchor='middle' fontSize='4' fontFamily='Roboto' letterSpacing='.2' className='text'></text>
            <path d='M50,25 h30 a10,10 0 0,1 10,10 a10,10 0 0,1 -10,10 s-30,0 -60,0 a10,10 0 0,1 -10,-10 a10,10 0 0,1 10,-10 h30' stroke='#00cffc' strokeWidth='.7' fill='transparent' className='btn'></path>
            <circle cx='20' cy='35' r='7.9' fill='#fff' fillOpacity='0' stroke='#fff' strokeWidth='1.6' strokeOpacity='0' className='subCircle'></circle>
            <circle cx='50' cy='26' r='0' fill='#fff' className='dot'></circle>
            <linearGradient id='gradient' x1='0%' y1='0%' x2='0%' y2='100%'>
                <stop offset='98%' className='gradient' stopColor='transparent' />
                <stop offset='98%' className='gradient' stopColor='#00afd3' />
            </linearGradient>
        </svg>
    );
};

export default DownloadAnimation;
