export interface TimeGreeting {
  salutation: string;
  motivationalNote: string;
}

// 1. Morning (5:00 AM – 11:59 AM) - 15 curated greetings
const MORNING_GREETINGS: TimeGreeting[] = [
  { salutation: 'Good morning', motivationalNote: 'Ready to build something extraordinary today?' },
  { salutation: 'Rise and shine', motivationalNote: 'A fresh canvas awaits your best ideas.' },
  { salutation: 'Good morning', motivationalNote: 'Let’s turn today’s vision into working reality.' },
  { salutation: 'Early start', motivationalNote: 'The quiet morning hours are where brilliance happens.' },
  { salutation: 'Good morning', motivationalNote: 'Grab your coffee — big problems are waiting to be solved.' },
  { salutation: 'Bright and early', motivationalNote: 'Let’s make today count with clean focus.' },
  { salutation: 'Good morning', motivationalNote: 'Every great breakthrough starts with a single question.' },
  { salutation: 'Rise and create', motivationalNote: 'What exciting project are we diving into today?' },
  { salutation: 'Good morning', motivationalNote: 'Small consistent steps build monumental things.' },
  { salutation: 'Fresh morning', motivationalNote: 'Clear mind, high momentum. Where shall we start?' },
  { salutation: 'Good morning', motivationalNote: 'Today is packed with potential. Let’s unlock it.' },
  { salutation: 'Welcome back', motivationalNote: 'A brand new day of learning, coding, and creating.' },
  { salutation: 'Good morning', motivationalNote: 'Curiosity is your superpower. Let’s explore.' },
  { salutation: 'Morning focus', motivationalNote: 'Set the tone for a remarkably productive day.' },
  { salutation: 'Good morning', motivationalNote: 'Ready to turn challenges into elegant solutions?' },
];

// 2. Afternoon (12:00 PM – 4:59 PM) - 15 curated greetings
const AFTERNOON_GREETINGS: TimeGreeting[] = [
  { salutation: 'Good afternoon', motivationalNote: 'Keep the momentum going strong.' },
  { salutation: 'Good afternoon', motivationalNote: 'Halfway through the day — what shall we conquer next?' },
  { salutation: 'Afternoon flow', motivationalNote: 'Locking into deep focus mode.' },
  { salutation: 'Good afternoon', motivationalNote: 'Making steady headway on the things that matter.' },
  { salutation: 'Good afternoon', motivationalNote: 'Let’s untangle that next complex challenge together.' },
  { salutation: 'Peak hours', motivationalNote: 'High energy, sharp thinking. What’s on deck?' },
  { salutation: 'Good afternoon', motivationalNote: 'Turning thoughts into structured, beautiful results.' },
  { salutation: 'Good afternoon', motivationalNote: 'Stay curious, stay inspired, keep iterating.' },
  { salutation: 'In the zone', motivationalNote: 'Great progress is built one focused block at a time.' },
  { salutation: 'Good afternoon', motivationalNote: 'Ready to write some clean, impactful work?' },
  { salutation: 'Powering through', motivationalNote: 'You’re doing great work — let’s keep pushing forward.' },
  { salutation: 'Good afternoon', motivationalNote: 'Every obstacle is just an optimization waiting to happen.' },
  { salutation: 'Midday momentum', motivationalNote: 'Let’s make this afternoon your most productive yet.' },
  { salutation: 'Good afternoon', motivationalNote: 'Precision, creativity, and speed. Let’s execute.' },
  { salutation: 'Good afternoon', motivationalNote: 'Ready to accelerate your workflow?' },
];

// 3. Evening (5:00 PM – 9:59 PM) - 12 curated greetings
const EVENING_GREETINGS: TimeGreeting[] = [
  { salutation: 'Good evening', motivationalNote: 'Time to bring today’s goals across the finish line.' },
  { salutation: 'Good evening', motivationalNote: 'Golden hour thinking — where creativity peaks.' },
  { salutation: 'Good evening', motivationalNote: 'Let’s reflect, polish, and put the finishing touches.' },
  { salutation: 'Winding down', motivationalNote: 'Or perhaps just gearing up for a burst of inspiration?' },
  { salutation: 'Good evening', motivationalNote: 'A day well spent is measured in problems solved.' },
  { salutation: 'Twilight focus', motivationalNote: 'The world slows down; the best ideas emerge.' },
  { salutation: 'Good evening', motivationalNote: 'Ready to wrap up something you’ll be proud of?' },
  { salutation: 'Good evening', motivationalNote: 'Refining today’s drafts into tomorrow’s masterpieces.' },
  { salutation: 'Evening session', motivationalNote: 'Let’s clear that final blocker before the night.' },
  { salutation: 'Good evening', motivationalNote: 'Celebrate the small wins you conquered today.' },
  { salutation: 'Good evening', motivationalNote: 'Unwind with some creative exploration.' },
  { salutation: 'Serene evening', motivationalNote: 'Deep thoughts and quiet execution.' },
];

// 4. Late Night / Night Owls (10:00 PM – 4:59 AM) - 12 curated greetings
const NIGHT_GREETINGS: TimeGreeting[] = [
  { salutation: 'Burning the midnight oil', motivationalNote: 'The world is quiet; your ambition is loud.' },
  { salutation: 'Late night flow', motivationalNote: 'Some of the best code is written past midnight.' },
  { salutation: 'Hello, night owl', motivationalNote: 'Midnight breakthroughs hit different.' },
  { salutation: 'Working late', motivationalNote: 'I’m right here beside you until the job is done.' },
  { salutation: 'Quiet hours', motivationalNote: 'Zero distractions, pure creative flow.' },
  { salutation: 'Still crafting', motivationalNote: 'Dedication at this hour never goes unnoticed.' },
  { salutation: 'Midnight sparks', motivationalNote: 'Let’s solve that stubborn puzzle once and for all.' },
  { salutation: 'Nighttime focus', motivationalNote: 'Deep into the architecture. Let’s build it right.' },
  { salutation: 'Late night session', motivationalNote: 'Fuel for the curious mind that never sleeps.' },
  { salutation: 'Stars are out', motivationalNote: 'Quiet determination turns into lasting mastery.' },
  { salutation: 'Midnight builder', motivationalNote: 'Turning late-night ideas into early-morning reality.' },
  { salutation: 'Deep night', motivationalNote: 'Peaceful hours for thoughtful work.' },
];

/**
 * Returns a time-dependent, inspirational greeting according to the current local hour.
 * Total of 54 curated time-dependent options.
 */
export function getTimeGreeting(date = new Date()): TimeGreeting {
  const hour = date.getHours();
  let bucket: TimeGreeting[];

  if (hour >= 5 && hour < 12) {
    bucket = MORNING_GREETINGS;
  } else if (hour >= 12 && hour < 17) {
    bucket = AFTERNOON_GREETINGS;
  } else if (hour >= 17 && hour < 22) {
    bucket = EVENING_GREETINGS;
  } else {
    bucket = NIGHT_GREETINGS;
  }

  const index = Math.floor(Math.random() * bucket.length);
  return bucket[index];
}
