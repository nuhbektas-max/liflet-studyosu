using System.Collections.Generic;
using Aurora.Core;
using Xunit;

public class RobotStateMachineTests
{
    static RobotSignals S(bool mic = false, bool user = false, bool wait = false, bool speak = false, string err = null)
        => new RobotSignals(mic, user, wait, speak, err);

    [Fact]
    public void FullConversationFollowsSpecTransitions()
    {
        var sm = new RobotStateMachine();
        var log = new List<(RobotState, RobotState)>();
        sm.StateChanged += (a, b) => log.Add((a, b));

        sm.Update(S(mic: true), 1);                 // mikrofon açıldı
        sm.Update(S(mic: true, user: true), 2);     // kullanıcı konuşuyor
        sm.Update(S(mic: true, wait: true), 3);     // konuşma bitti, yanıt bekleniyor
        sm.Update(S(mic: true, speak: true), 4);    // robot konuşuyor
        sm.Update(S(), 5);                          // bitti, mikrofon kapandı

        Assert.Equal(new[]
        {
            (RobotState.Idle, RobotState.Listening),
            (RobotState.Listening, RobotState.Thinking),
            (RobotState.Thinking, RobotState.Speaking),
            (RobotState.Speaking, RobotState.Idle),
        }, log);
    }

    [Fact]
    public void SameStateDoesNotFireAgain()
    {
        var sm = new RobotStateMachine();
        int count = 0;
        sm.StateChanged += (a, b) => count++;
        for (int i = 0; i < 10; i++) sm.Update(S(speak: true), i);
        Assert.Equal(1, count);
        Assert.Equal(RobotState.Speaking, sm.Current);
    }

    [Fact]
    public void ErrorFromAnyStateAndHoldsMinimumTime()
    {
        var sm = new RobotStateMachine { MinimumErrorSeconds = 3 };
        sm.Update(S(wait: true), 0);
        Assert.Equal(RobotState.Thinking, sm.Current);
        sm.Update(S(err: "Bağlantı yok"), 1);
        Assert.Equal(RobotState.Error, sm.Current);
        Assert.Equal("Bağlantı yok", sm.ErrorMessage);

        sm.Update(S(), 2);                 // hata kalktı ama 3 sn dolmadı
        Assert.Equal(RobotState.Error, sm.Current);
        sm.Update(S(), 4.5);
        Assert.Equal(RobotState.Idle, sm.Current);
        Assert.Null(sm.ErrorMessage);
    }

    [Fact]
    public void ErrorToSpeakingGoesThroughIdle()
    {
        var sm = new RobotStateMachine { MinimumErrorSeconds = 0 };
        var log = new List<RobotState>();
        sm.StateChanged += (a, b) => log.Add(b);
        sm.Update(S(err: "x"), 0);
        sm.Update(S(speak: true), 1);
        Assert.Equal(new[] { RobotState.Error, RobotState.Idle, RobotState.Speaking }, log);
    }

    [Fact]
    public void UserInterruptsSpeakingGoesToListening()
    {
        var sm = new RobotStateMachine();
        sm.Update(S(mic: true, speak: true), 0);
        Assert.Equal(RobotState.Speaking, sm.Current);
        sm.Update(S(mic: true, user: true, speak: true), 1);
        Assert.Equal(RobotState.Listening, sm.Current);
    }

    [Fact]
    public void TypedQuestionGoesIdleToThinking()
    {
        var sm = new RobotStateMachine();
        sm.Update(S(wait: true), 0);
        Assert.Equal(RobotState.Thinking, sm.Current);
    }

    [Theory]
    [InlineData(RobotState.Idle, RobotState.Listening, true)]
    [InlineData(RobotState.Listening, RobotState.Thinking, true)]
    [InlineData(RobotState.Thinking, RobotState.Speaking, true)]
    [InlineData(RobotState.Speaking, RobotState.Idle, true)]
    [InlineData(RobotState.Error, RobotState.Idle, true)]
    [InlineData(RobotState.Error, RobotState.Speaking, false)]
    [InlineData(RobotState.Listening, RobotState.Speaking, false)]
    [InlineData(RobotState.Idle, RobotState.Idle, false)]
    public void AllowedTransitions(RobotState from, RobotState to, bool allowed)
        => Assert.Equal(allowed, RobotStateMachine.IsAllowed(from, to));

    [Fact]
    public void EveryStateCanEnterError()
    {
        foreach (RobotState s in System.Enum.GetValues(typeof(RobotState)))
            if (s != RobotState.Error) Assert.True(RobotStateMachine.IsAllowed(s, RobotState.Error));
    }

    [Fact]
    public void PaletteMatchesSpec()
    {
        Assert.Equal("Bekliyor", RobotStatePalette.LabelOf(RobotState.Idle));
        var green = RobotStatePalette.ColorOf(RobotState.Listening);
        Assert.True(green.G > green.R && green.G > green.B);
        var purple = RobotStatePalette.ColorOf(RobotState.Thinking);
        Assert.True(purple.R > purple.G && purple.B > purple.G);
    }
}
